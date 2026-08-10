import type {
  WorkspaceBrowserAttachInput,
  WorkspaceBrowserBounds,
  WorkspaceBrowserCommandInput,
  WorkspaceBrowserCreateInput,
  WorkspaceBrowserDetachInput,
  WorkspaceBrowserError,
  WorkspaceBrowserNavigateInput,
  WorkspaceBrowserOpenExternalInput,
  WorkspaceBrowserSetBoundsInput,
  WorkspaceBrowserState,
} from "../../../shared/workspace-browser";

import is from "@sindresorhus/is";
import { type } from "arktype";
import { BrowserWindow, ipcMain, shell, WebContentsView } from "electron";

import {
  WORKSPACE_BROWSER_ATTACH_CHANNEL,
  WORKSPACE_BROWSER_CREATE_CHANNEL,
  WORKSPACE_BROWSER_DESTROY_CHANNEL,
  WORKSPACE_BROWSER_DETACH_CHANNEL,
  WORKSPACE_BROWSER_GET_STATE_CHANNEL,
  WORKSPACE_BROWSER_GO_BACK_CHANNEL,
  WORKSPACE_BROWSER_GO_FORWARD_CHANNEL,
  WORKSPACE_BROWSER_NAVIGATE_CHANNEL,
  WORKSPACE_BROWSER_OPEN_EXTERNAL_CHANNEL,
  WORKSPACE_BROWSER_RELOAD_CHANNEL,
  WORKSPACE_BROWSER_SET_BOUNDS_CHANNEL,
  workspaceBrowserEventChannel,
} from "../../../shared/workspace-browser";

import {
  normalizeWorkspaceBrowserLoadFailure,
  normalizeWorkspaceBrowserNavigateFailure,
  sanitizeBrowserUrl,
} from "./normalize-error";

interface WorkspaceBrowserAttachment {
  attachmentId: string;
  window: BrowserWindow;
}

interface WorkspaceBrowserInstance {
  attachment?: WorkspaceBrowserAttachment;
  browserViewId: string;
  error: WorkspaceBrowserError | null;
  loading: boolean;
  ready: boolean;
  title: string;
  url: string;
  view: WebContentsView;
}

const workspaceBrowserInstances = new Map<string, WorkspaceBrowserInstance>();

const nonEmptyTrimmedString = type("string.trim").to("string > 0");
const finiteNumber = type("number").narrow(
  (value, ctx) => Number.isFinite(value) || ctx.mustBe("finite"),
);
const workspaceBrowserDimension = finiteNumber
  .pipe((value) => Math.max(1, Math.round(value)))
  .to("number");
const workspaceBrowserCoordinate = finiteNumber
  .pipe((value) => Math.round(value))
  .to("number");

const workspaceBrowserBoundsInput = type({
  "+": "ignore",
  height: workspaceBrowserDimension,
  width: workspaceBrowserDimension,
  x: workspaceBrowserCoordinate,
  y: workspaceBrowserCoordinate,
});

const workspaceBrowserCreateInput = type({
  "+": "ignore",
  browserViewId: nonEmptyTrimmedString,
  url: nonEmptyTrimmedString,
});

const workspaceBrowserAttachInput = type({
  "+": "ignore",
  attachmentId: nonEmptyTrimmedString,
  bounds: workspaceBrowserBoundsInput,
  browserViewId: nonEmptyTrimmedString,
});

const workspaceBrowserDetachInput = type({
  "+": "ignore",
  attachmentId: nonEmptyTrimmedString,
  browserViewId: nonEmptyTrimmedString,
});

const workspaceBrowserSetBoundsInput = type({
  "+": "ignore",
  attachmentId: nonEmptyTrimmedString,
  bounds: workspaceBrowserBoundsInput,
  browserViewId: nonEmptyTrimmedString,
});

const workspaceBrowserCommandInput = type({
  "+": "ignore",
  browserViewId: nonEmptyTrimmedString,
});

const workspaceBrowserNavigateInput = type({
  "+": "ignore",
  browserViewId: nonEmptyTrimmedString,
  url: nonEmptyTrimmedString,
});

const workspaceBrowserOpenExternalInput = type({
  "+": "ignore",
  url: nonEmptyTrimmedString,
});

export function registerWorkspaceBrowserIpc() {
  ipcMain.handle(WORKSPACE_BROWSER_CREATE_CHANNEL, (_event, input: unknown) => {
    const request = parseWorkspaceBrowserCreateInput(input);
    const instance = ensureWorkspaceBrowserInstance(request);
    return workspaceBrowserState(instance);
  });

  ipcMain.handle(WORKSPACE_BROWSER_ATTACH_CHANNEL, (event, input: unknown) => {
    const request = parseWorkspaceBrowserAttachInput(input);
    const instance = getWorkspaceBrowserInstance(request.browserViewId);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) {
      throw new Error("Workspace browser host window is not available.");
    }

    attachWorkspaceBrowserView(instance, window, request);
    return workspaceBrowserState(instance);
  });

  ipcMain.handle(WORKSPACE_BROWSER_DETACH_CHANNEL, (_event, input: unknown) => {
    const request = parseWorkspaceBrowserDetachInput(input);
    const instance = workspaceBrowserInstances.get(request.browserViewId);
    if (instance) {
      detachWorkspaceBrowserView(instance, request.attachmentId);
    }
    return { ok: true };
  });

  ipcMain.handle(
    WORKSPACE_BROWSER_SET_BOUNDS_CHANNEL,
    (_event, input: unknown) => {
      const request = parseWorkspaceBrowserSetBoundsInput(input);
      const instance = getWorkspaceBrowserInstance(request.browserViewId);
      if (instance.attachment?.attachmentId === request.attachmentId) {
        instance.view.setBounds(toElectronBounds(request.bounds));
      }
      return workspaceBrowserState(instance);
    },
  );

  ipcMain.handle(
    WORKSPACE_BROWSER_DESTROY_CHANNEL,
    (_event, input: unknown) => {
      const request = parseWorkspaceBrowserCommandInput(input);
      const instance = workspaceBrowserInstances.get(request.browserViewId);
      if (!instance) {
        return { ok: true };
      }

      detachWorkspaceBrowserView(instance);
      workspaceBrowserInstances.delete(request.browserViewId);
      instance.view.webContents.close();
      return { ok: true };
    },
  );

  ipcMain.handle(WORKSPACE_BROWSER_GET_STATE_CHANNEL, (_event, input) => {
    return workspaceBrowserState(
      getWorkspaceBrowserInstance(
        parseWorkspaceBrowserCommandInput(input).browserViewId,
      ),
    );
  });

  ipcMain.handle(WORKSPACE_BROWSER_NAVIGATE_CHANNEL, (_event, input) => {
    const request = parseWorkspaceBrowserNavigateInput(input);
    const instance = getWorkspaceBrowserInstance(request.browserViewId);
    loadWorkspaceBrowserUrl(instance, request.url);
    return workspaceBrowserState(instance);
  });

  ipcMain.handle(WORKSPACE_BROWSER_GO_BACK_CHANNEL, (_event, input) => {
    const instance = getWorkspaceBrowserInstance(
      parseWorkspaceBrowserCommandInput(input).browserViewId,
    );
    if (instance.view.webContents.canGoBack()) {
      instance.view.webContents.goBack();
    }
    return workspaceBrowserState(instance);
  });

  ipcMain.handle(WORKSPACE_BROWSER_GO_FORWARD_CHANNEL, (_event, input) => {
    const instance = getWorkspaceBrowserInstance(
      parseWorkspaceBrowserCommandInput(input).browserViewId,
    );
    if (instance.view.webContents.canGoForward()) {
      instance.view.webContents.goForward();
    }
    return workspaceBrowserState(instance);
  });

  ipcMain.handle(WORKSPACE_BROWSER_RELOAD_CHANNEL, (_event, input) => {
    const instance = getWorkspaceBrowserInstance(
      parseWorkspaceBrowserCommandInput(input).browserViewId,
    );
    instance.error = null;
    instance.loading = true;
    instance.ready = false;
    instance.view.webContents.reload();
    emitWorkspaceBrowserState(instance);
    return workspaceBrowserState(instance);
  });

  ipcMain.handle(
    WORKSPACE_BROWSER_OPEN_EXTERNAL_CHANNEL,
    async (_event, input: unknown) => {
      const request = parseWorkspaceBrowserOpenExternalInput(input);
      const url = sanitizeBrowserUrl(request.url);
      if (url === undefined) {
        throw new Error("Workspace browser only supports http(s) URLs.");
      }
      await shell.openExternal(url);
      return { ok: true as const };
    },
  );
}

function ensureWorkspaceBrowserInstance({
  browserViewId,
  url,
}: WorkspaceBrowserCreateInput) {
  const existing = workspaceBrowserInstances.get(browserViewId);
  if (existing) {
    return existing;
  }
  const initialUrl = workspaceBrowserLoadUrl(url);

  const view = new WebContentsView({
    webPreferences: {
      partition: "persist:workspace-browser",
    },
  });
  const instance: WorkspaceBrowserInstance = {
    browserViewId,
    error: null,
    loading: true,
    ready: false,
    title: "",
    url: initialUrl,
    view,
  };

  workspaceBrowserInstances.set(browserViewId, instance);
  configureWorkspaceBrowserWebContents(instance);
  loadWorkspaceBrowserUrl(instance, initialUrl);
  return instance;
}

function configureWorkspaceBrowserWebContents(
  instance: WorkspaceBrowserInstance,
) {
  const { webContents } = instance.view;

  webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      loadWorkspaceBrowserUrl(instance, url);
    } else if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  webContents.on("dom-ready", () => {
    instance.ready = true;
    instance.loading = false;
    emitWorkspaceBrowserState(instance);
  });
  webContents.on("did-start-loading", () => {
    instance.ready = false;
    instance.loading = true;
    instance.error = null;
    emitWorkspaceBrowserState(instance);
  });
  webContents.on("did-finish-load", () => {
    instance.ready = true;
    instance.loading = false;
    instance.error = null;
    refreshWorkspaceBrowserLocation(instance);
    emitWorkspaceBrowserState(instance);
  });
  webContents.on(
    "did-fail-load",
    (
      _event,
      errorCode: number,
      errorDescription: string,
      validatedURL: string,
      isMainFrame: boolean,
    ) => {
      const normalized = normalizeWorkspaceBrowserLoadFailure({
        errorCode,
        errorDescription,
        isMainFrame,
        validatedURL,
      });
      instance.ready = true;
      instance.loading = false;
      if (normalized !== null) {
        instance.error = normalized;
      }
      refreshWorkspaceBrowserLocation(instance);
      emitWorkspaceBrowserState(instance);
    },
  );
  webContents.on("did-navigate", (_event, url) => {
    instance.url = url;
    emitWorkspaceBrowserState(instance);
  });
  webContents.on("did-navigate-in-page", (_event, url) => {
    instance.url = url;
    emitWorkspaceBrowserState(instance);
  });
  webContents.on("page-title-updated", (_event, title) => {
    instance.title = title;
    emitWorkspaceBrowserState(instance);
  });
  webContents.on("destroyed", () => {
    workspaceBrowserInstances.delete(instance.browserViewId);
  });
}

function attachWorkspaceBrowserView(
  instance: WorkspaceBrowserInstance,
  window: BrowserWindow,
  request: WorkspaceBrowserAttachInput,
) {
  if (
    instance.attachment &&
    (!isSameWindow(instance.attachment.window, window) ||
      instance.attachment.attachmentId !== request.attachmentId)
  ) {
    detachWorkspaceBrowserView(instance);
  }

  window.contentView.addChildView(instance.view);
  instance.view.setBounds(toElectronBounds(request.bounds));
  instance.attachment = {
    attachmentId: request.attachmentId,
    window,
  };

  window.once("closed", () => {
    detachWorkspaceBrowserView(instance, request.attachmentId);
  });
  emitWorkspaceBrowserState(instance);
}

function detachWorkspaceBrowserView(
  instance: WorkspaceBrowserInstance,
  attachmentId?: string,
) {
  if (!instance.attachment) {
    return;
  }
  if (
    is.nonEmptyString(attachmentId) &&
    instance.attachment.attachmentId !== attachmentId
  ) {
    return;
  }

  const window = instance.attachment.window;
  if (!window.isDestroyed()) {
    window.contentView.removeChildView(instance.view);
  }
  instance.attachment = undefined;
}

function loadWorkspaceBrowserUrl(
  instance: WorkspaceBrowserInstance,
  url: string,
) {
  let nextUrl: string;
  try {
    nextUrl = workspaceBrowserLoadUrl(url);
  } catch (error: unknown) {
    instance.error = normalizeWorkspaceBrowserNavigateFailure(error, url);
    instance.loading = false;
    instance.ready = true;
    emitWorkspaceBrowserState(instance);
    return;
  }

  instance.url = nextUrl;
  instance.error = null;
  instance.loading = true;
  instance.ready = false;
  emitWorkspaceBrowserState(instance);
  void instance.view.webContents.loadURL(nextUrl).catch((error: unknown) => {
    console.error("Failed to load workspace browser URL.", {
      browserViewId: instance.browserViewId,
      url: nextUrl,
    });
    instance.error = normalizeWorkspaceBrowserNavigateFailure(error, nextUrl);
    instance.loading = false;
    instance.ready = true;
    emitWorkspaceBrowserState(instance);
  });
}

function workspaceBrowserLoadUrl(url: string) {
  const nextUrl = url.trim() || "about:blank";
  if (nextUrl !== "about:blank" && !isHttpUrl(nextUrl)) {
    throw new Error("Workspace browser only supports http(s) URLs.");
  }
  return nextUrl;
}

function refreshWorkspaceBrowserLocation(instance: WorkspaceBrowserInstance) {
  const { webContents } = instance.view;
  instance.url = webContents.getURL() || instance.url;
  instance.title = webContents.getTitle() || instance.title;
}

function emitWorkspaceBrowserState(instance: WorkspaceBrowserInstance) {
  const payload = {
    state: workspaceBrowserState(instance),
    type: "state",
  } as const;

  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(
        workspaceBrowserEventChannel(instance.browserViewId),
        payload,
      );
    }
  }
}

function workspaceBrowserState(
  instance: WorkspaceBrowserInstance,
): WorkspaceBrowserState {
  const { webContents } = instance.view;
  const loading = instance.loading || webContents.isLoading();
  return {
    canGoBack: webContents.canGoBack(),
    canGoForward: webContents.canGoForward(),
    error: instance.error,
    loading,
    ready: instance.ready || !loading,
    title: instance.title || webContents.getTitle(),
    url: webContents.getURL() || instance.url,
  };
}

function getWorkspaceBrowserInstance(browserViewId: string) {
  const instance = workspaceBrowserInstances.get(browserViewId);
  if (!instance) {
    throw new Error("Workspace browser instance was not created.");
  }
  return instance;
}

export function parseWorkspaceBrowserCreateInput(
  input: unknown,
): WorkspaceBrowserCreateInput {
  const value = workspaceBrowserCreateInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseWorkspaceBrowserAttachInput(
  input: unknown,
): WorkspaceBrowserAttachInput {
  const value = workspaceBrowserAttachInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseWorkspaceBrowserDetachInput(
  input: unknown,
): WorkspaceBrowserDetachInput {
  const value = workspaceBrowserDetachInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseWorkspaceBrowserSetBoundsInput(
  input: unknown,
): WorkspaceBrowserSetBoundsInput {
  const value = workspaceBrowserSetBoundsInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseWorkspaceBrowserCommandInput(
  input: unknown,
): WorkspaceBrowserCommandInput {
  const value = workspaceBrowserCommandInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseWorkspaceBrowserNavigateInput(
  input: unknown,
): WorkspaceBrowserNavigateInput {
  const value = workspaceBrowserNavigateInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseWorkspaceBrowserOpenExternalInput(
  input: unknown,
): WorkspaceBrowserOpenExternalInput {
  const value = workspaceBrowserOpenExternalInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

export function parseWorkspaceBrowserBounds(
  input: unknown,
): WorkspaceBrowserBounds {
  const value = workspaceBrowserBoundsInput(input);
  if (value instanceof type.errors) {
    throw new TypeError(value.summary);
  }
  return value;
}

function toElectronBounds(bounds: WorkspaceBrowserBounds) {
  return {
    height: bounds.height,
    width: bounds.width,
    x: bounds.x,
    y: bounds.y,
  };
}

function isSameWindow(left: BrowserWindow, right: BrowserWindow) {
  return !left.isDestroyed() && !right.isDestroyed() && left.id === right.id;
}

function isHttpUrl(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string) {
  try {
    return new URL(url).protocol === "mailto:";
  } catch {
    return false;
  }
}
