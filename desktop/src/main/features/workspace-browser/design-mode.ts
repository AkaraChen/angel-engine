import type { WebContents } from "electron";
import type {
  DesignGuestCommand,
  DesignGuestEvent,
  DesignOutputDetail,
  DesignRuntimeEvent,
  WorkspaceBrowserDesignSetAllowedOriginsInput,
  WorkspaceBrowserDesignStartInput,
  WorkspaceBrowserDesignState,
  WorkspaceBrowserDesignStartOutcome,
} from "../../../shared/workspace-browser";

import is from "@sindresorhus/is";
import { type } from "arktype";
import { ipcMain } from "electron";

import { normalizeDesignOutputDetail } from "../../../shared/design-mode-capture";
import {
  WORKSPACE_BROWSER_DESIGN_GUEST_COMMAND_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL,
  designModeOriginFromUrl,
  isDesignModeAllowedOrigin,
  workspaceBrowserDesignEventChannel,
} from "../../../shared/workspace-browser";

export interface DesignModeBrowserView {
  browserViewId: string;
  webContents: WebContents;
}

export interface DesignModeHostEmitter {
  sendToAllWindows: (channel: string, payload: DesignRuntimeEvent) => void;
}

interface DesignModeSession {
  active: boolean;
  allowedOrigins: string[];
  outputDetail: DesignOutputDetail;
}

const nonEmptyTrimmedString = type("string.trim").to("string > 0");

const designModeCommandInput = type({
  "+": "ignore",
  browserViewId: nonEmptyTrimmedString,
  "outputDetail?": "'compact'|'standard'|'detailed'",
});

const designModeSetAllowedOriginsInput = type({
  "+": "ignore",
  browserViewId: nonEmptyTrimmedString,
  origins: type("string[]"),
});

/**
 * Design Mode main-side service.
 *
 * Trust model:
 * - Guest preload never receives a page-callable API for send/start.
 * - Origin always comes from `webContents.getURL()`, never guest-reported origin.
 * - Guest events are dropped unless Design Mode is active and origin is allowlisted.
 */
export class WorkspaceBrowserDesignModeService {
  private readonly sessions = new Map<string, DesignModeSession>();
  private readonly webContentsToViewId = new Map<number, string>();
  private guestEventHandler:
    | ((event: Electron.IpcMainEvent, payload: unknown) => void)
    | undefined;

  constructor(
    private readonly resolveView: (
      browserViewId: string,
    ) => DesignModeBrowserView | undefined,
    private readonly host: DesignModeHostEmitter,
  ) {}

  register() {
    if (this.guestEventHandler) {
      return;
    }

    this.guestEventHandler = (event, payload) => {
      this.handleGuestEvent(event.sender, payload);
    };
    ipcMain.on(
      WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL,
      this.guestEventHandler,
    );
  }

  dispose() {
    if (this.guestEventHandler) {
      ipcMain.removeListener(
        WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL,
        this.guestEventHandler,
      );
      this.guestEventHandler = undefined;
    }
    this.sessions.clear();
  }

  forget(browserViewId: string) {
    const session = this.sessions.get(browserViewId);
    if (session?.active) {
      const view = this.resolveView(browserViewId);
      if (view && !view.webContents.isDestroyed()) {
        this.sendGuestCommand(view.webContents, { type: "stop" });
      }
    }
    this.sessions.delete(browserViewId);
    for (const [webContentsId, mappedId] of this.webContentsToViewId) {
      if (mappedId === browserViewId) {
        this.webContentsToViewId.delete(webContentsId);
      }
    }
  }

  getState(browserViewId: string): WorkspaceBrowserDesignState {
    const view = this.resolveView(browserViewId);
    const session = this.ensureSession(browserViewId);
    if (!view || view.webContents.isDestroyed()) {
      return {
        active: false,
        allowed: false,
        origin: null,
      };
    }

    this.rememberWebContents(browserViewId, view.webContents);
    const origin = designModeOriginFromUrl(view.webContents.getURL());
    return {
      active: session.active,
      allowed: isDesignModeAllowedOrigin(
        view.webContents.getURL(),
        session.allowedOrigins,
      ),
      origin,
    };
  }

  setAllowedOrigins(
    input: WorkspaceBrowserDesignSetAllowedOriginsInput,
  ): WorkspaceBrowserDesignState {
    const session = this.ensureSession(input.browserViewId);
    session.allowedOrigins = input.origins
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0)
      .map((origin) => {
        try {
          const parsed = new URL(
            origin.includes("://") ? origin : `http://${origin}`,
          );
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
          }
          return parsed.origin;
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => origin !== null);
    return this.getState(input.browserViewId);
  }

  start(
    browserViewId: string,
    outputDetail?: DesignOutputDetail,
  ): WorkspaceBrowserDesignStartOutcome {
    const view = this.resolveView(browserViewId);
    if (!view || view.webContents.isDestroyed()) {
      return {
        code: "instance-missing",
        message: "Workspace browser instance was not created.",
        ok: false,
        state: {
          active: false,
          allowed: false,
          origin: null,
        },
      };
    }

    const session = this.ensureSession(browserViewId);
    if (outputDetail) {
      session.outputDetail = normalizeDesignOutputDetail(outputDetail);
    }
    this.rememberWebContents(browserViewId, view.webContents);
    const pageUrl = view.webContents.getURL();
    const origin = designModeOriginFromUrl(pageUrl);
    const allowed = isDesignModeAllowedOrigin(pageUrl, session.allowedOrigins);
    const state: WorkspaceBrowserDesignState = {
      active: session.active,
      allowed,
      origin,
    };

    if (!allowed) {
      this.emitHostEvent({
        browserViewId,
        code: "origin-not-allowed",
        message:
          "Design Mode is only available on localhost and registered preview origins.",
        origin: origin ?? "",
        type: "error",
      });
      return {
        code: "origin-not-allowed",
        message:
          "Design Mode is only available on localhost and registered preview origins.",
        ok: false,
        state,
      };
    }

    if (session.active) {
      // Already active: push detail tier updates without remounting.
      this.sendGuestCommand(view.webContents, {
        outputDetail: session.outputDetail,
        type: "setOutputDetail",
      });
      return { ok: true, state: { ...state, active: true } };
    }

    session.active = true;
    this.sendGuestCommand(view.webContents, {
      outputDetail: session.outputDetail,
      type: "start",
    });
    const nextState: WorkspaceBrowserDesignState = {
      active: true,
      allowed: true,
      origin,
    };
    return { ok: true, state: nextState };
  }

  stop(browserViewId: string): WorkspaceBrowserDesignState {
    const view = this.resolveView(browserViewId);
    const session = this.ensureSession(browserViewId);
    const wasActive = session.active;
    if (wasActive && view && !view.webContents.isDestroyed()) {
      this.sendGuestCommand(view.webContents, { type: "stop" });
    }
    session.active = false;
    const state = this.getState(browserViewId);
    if (wasActive) {
      // Emit from main so host UI always clears even if the guest is gone.
      // Duplicate guest `stopped` events are dropped while inactive.
      this.emitHostEvent({
        browserViewId,
        origin: state.origin ?? "",
        type: "stopped",
      });
    }
    return state;
  }

  /** Stop design mode when the page navigates off the allowlist. */
  onNavigation(browserViewId: string) {
    const session = this.sessions.get(browserViewId);
    if (!session?.active) {
      return;
    }
    const view = this.resolveView(browserViewId);
    if (!view || view.webContents.isDestroyed()) {
      session.active = false;
      return;
    }
    if (
      !isDesignModeAllowedOrigin(
        view.webContents.getURL(),
        session.allowedOrigins,
      )
    ) {
      this.sendGuestCommand(view.webContents, { type: "stop" });
      session.active = false;
      const origin = designModeOriginFromUrl(view.webContents.getURL()) ?? "";
      this.emitHostEvent({
        browserViewId,
        origin,
        type: "stopped",
      });
    }
  }

  parseCommandInput(input: unknown): WorkspaceBrowserDesignStartInput {
    const value = designModeCommandInput(input);
    if (value instanceof type.errors) {
      throw new TypeError(value.summary);
    }
    return {
      browserViewId: value.browserViewId,
      outputDetail: value.outputDetail
        ? normalizeDesignOutputDetail(value.outputDetail)
        : undefined,
    };
  }

  parseSetAllowedOriginsInput(
    input: unknown,
  ): WorkspaceBrowserDesignSetAllowedOriginsInput {
    const value = designModeSetAllowedOriginsInput(input);
    if (value instanceof type.errors) {
      throw new TypeError(value.summary);
    }
    return {
      browserViewId: value.browserViewId,
      origins: value.origins,
    };
  }

  private ensureSession(browserViewId: string): DesignModeSession {
    const existing = this.sessions.get(browserViewId);
    if (existing) {
      return existing;
    }
    const created: DesignModeSession = {
      active: false,
      allowedOrigins: [],
      outputDetail: "standard",
    };
    this.sessions.set(browserViewId, created);
    return created;
  }

  private sendGuestCommand(
    webContents: WebContents,
    command: DesignGuestCommand,
  ) {
    webContents.send(WORKSPACE_BROWSER_DESIGN_GUEST_COMMAND_CHANNEL, command);
  }

  private handleGuestEvent(sender: WebContents, payload: unknown) {
    const browserViewId = this.findBrowserViewId(sender);
    if (!browserViewId) {
      return;
    }

    const session = this.sessions.get(browserViewId);
    if (!session) {
      return;
    }

    // Trusted origin from the real WebContents URL — ignore any guest-supplied origin.
    const pageUrl = sender.isDestroyed() ? "" : sender.getURL();
    const origin = designModeOriginFromUrl(pageUrl) ?? "";
    const allowed = isDesignModeAllowedOrigin(pageUrl, session.allowedOrigins);

    if (!session.active || !allowed) {
      // Drop forged or off-allowlist guest events; never forward to host UI.
      return;
    }

    const guestEvent = parseDesignGuestEvent(payload);
    if (!guestEvent) {
      return;
    }

    if (guestEvent.type === "stopped") {
      session.active = false;
    }
    if (guestEvent.type === "started") {
      session.active = true;
    }

    this.emitHostEvent(toHostDesignEvent(browserViewId, origin, guestEvent));
  }

  private findBrowserViewId(sender: WebContents): string | undefined {
    const mapped = this.webContentsToViewId.get(sender.id);
    if (mapped) {
      return mapped;
    }

    // Fallback: linear scan is fine — few workspace browser views per app.
    for (const browserViewId of this.sessions.keys()) {
      const view = this.resolveView(browserViewId);
      if (
        view &&
        !view.webContents.isDestroyed() &&
        view.webContents.id === sender.id
      ) {
        this.rememberWebContents(browserViewId, view.webContents);
        return browserViewId;
      }
    }

    return undefined;
  }

  private rememberWebContents(browserViewId: string, webContents: WebContents) {
    if (!webContents.isDestroyed()) {
      this.webContentsToViewId.set(webContents.id, browserViewId);
    }
  }

  private emitHostEvent(event: DesignRuntimeEvent) {
    this.host.sendToAllWindows(
      workspaceBrowserDesignEventChannel(event.browserViewId),
      event,
    );
  }
}

export function parseDesignGuestEvent(
  payload: unknown,
): DesignGuestEvent | null {
  if (!is.plainObject(payload) || !is.string(payload.type)) {
    return null;
  }

  if (payload.type === "started" || payload.type === "stopped") {
    return { type: payload.type };
  }

  // Stage 2 emits element/region selections. Drop reserved text/point kinds
  // and malformed payloads so host never sees junk.
  if (payload.type === "selection") {
    if (!is.plainObject(payload.anchor) || !is.string(payload.anchor.kind)) {
      return null;
    }
    const kind = payload.anchor.kind;
    if (kind !== "element" && kind !== "region") {
      return null;
    }
    if (!is.plainObject(payload.anchor.rect)) {
      return null;
    }
    if (kind === "element" && !is.string(payload.anchor.selector)) {
      return null;
    }
    return payload as DesignGuestEvent;
  }

  return null;
}

function toHostDesignEvent(
  browserViewId: string,
  origin: string,
  guestEvent: DesignGuestEvent,
): DesignRuntimeEvent {
  if (guestEvent.type === "started" || guestEvent.type === "stopped") {
    return {
      browserViewId,
      origin,
      type: guestEvent.type,
    };
  }

  return {
    anchor: guestEvent.anchor,
    browserViewId,
    changes: guestEvent.changes,
    element: guestEvent.element,
    origin,
    type: "selection",
  };
}
