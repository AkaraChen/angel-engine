export const WORKSPACE_BROWSER_ATTACH_CHANNEL = "workspace-browser:attach";
export const WORKSPACE_BROWSER_CREATE_CHANNEL = "workspace-browser:create";
export const WORKSPACE_BROWSER_DESTROY_CHANNEL = "workspace-browser:destroy";
export const WORKSPACE_BROWSER_DETACH_CHANNEL = "workspace-browser:detach";
export const WORKSPACE_BROWSER_GET_STATE_CHANNEL =
  "workspace-browser:get-state";
export const WORKSPACE_BROWSER_GO_BACK_CHANNEL = "workspace-browser:go-back";
export const WORKSPACE_BROWSER_GO_FORWARD_CHANNEL =
  "workspace-browser:go-forward";
export const WORKSPACE_BROWSER_NAVIGATE_CHANNEL = "workspace-browser:navigate";
export const WORKSPACE_BROWSER_RELOAD_CHANNEL = "workspace-browser:reload";
export const WORKSPACE_BROWSER_SET_BOUNDS_CHANNEL =
  "workspace-browser:set-bounds";

/** Host → main: enter Design Mode on a browser view (no-op if already active). */
export const WORKSPACE_BROWSER_DESIGN_START_CHANNEL =
  "workspace-browser:design:start";
/** Host → main: leave Design Mode and tear down guest overlay. */
export const WORKSPACE_BROWSER_DESIGN_STOP_CHANNEL =
  "workspace-browser:design:stop";
/** Host → main: replace extra allowlisted origins for a browser view. */
export const WORKSPACE_BROWSER_DESIGN_SET_ALLOWED_ORIGINS_CHANNEL =
  "workspace-browser:design:set-allowed-origins";
/** Host → main: read Design Mode state for a browser view. */
export const WORKSPACE_BROWSER_DESIGN_GET_STATE_CHANNEL =
  "workspace-browser:design:get-state";

/**
 * Main → guest preload: start/stop commands for the design-mode runtime.
 * Guest pages never see this channel name through `window.*`.
 */
export const WORKSPACE_BROWSER_DESIGN_GUEST_COMMAND_CHANNEL =
  "workspace-browser:design:guest-command";
/**
 * Guest preload → main: runtime lifecycle / future selection events.
 * Main stamps `browserViewId` + trusted origin before forwarding to host.
 */
export const WORKSPACE_BROWSER_DESIGN_GUEST_EVENT_CHANNEL =
  "workspace-browser:design:guest-event";

export function workspaceBrowserEventChannel(browserViewId: string) {
  return `workspace-browser:event:${browserViewId}`;
}

export function workspaceBrowserDesignEventChannel(browserViewId: string) {
  return `workspace-browser:design:event:${browserViewId}`;
}

export interface WorkspaceBrowserBounds {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface WorkspaceBrowserCreateInput {
  browserViewId: string;
  url: string;
}

export interface WorkspaceBrowserAttachInput {
  attachmentId: string;
  bounds: WorkspaceBrowserBounds;
  browserViewId: string;
}

export interface WorkspaceBrowserDetachInput {
  attachmentId: string;
  browserViewId: string;
}

export interface WorkspaceBrowserSetBoundsInput {
  attachmentId: string;
  bounds: WorkspaceBrowserBounds;
  browserViewId: string;
}

export interface WorkspaceBrowserCommandInput {
  browserViewId: string;
}

export interface WorkspaceBrowserNavigateInput
  extends WorkspaceBrowserCommandInput {
  url: string;
}

export interface WorkspaceBrowserState {
  canGoBack: boolean;
  canGoForward: boolean;
  ready: boolean;
  title: string;
  url: string;
}

export interface WorkspaceBrowserEvent {
  state: WorkspaceBrowserState;
  type: "state";
}

export interface WorkspaceBrowserOkResult {
  ok: true;
}

// --- Design Mode contracts (F04 skeleton; selection/capture later) ---

export interface DesignRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

/**
 * Selection anchor shapes. Stage 1 only wires the pipeline; stage 2 fills
 * `element` / `region`. `text` / `point` stay reserved.
 */
export type DesignAnchor =
  | {
      kind: "element";
      rect: DesignRect;
      selector: string;
    }
  | {
      kind: "region";
      rect: DesignRect;
    }
  | {
      kind: "text";
      rect: DesignRect;
      text: string;
    }
  | {
      kind: "point";
      x: number;
      y: number;
    };

/**
 * How much element context the guest capture pipeline includes.
 * Default is `standard`. Higher detail costs more agent context tokens.
 */
export type DesignOutputDetail = "compact" | "standard" | "detailed";

/**
 * Parent-chain summary only — never carries input values.
 * Used so agents can place the leaf without a full tree scan.
 */
export interface DesignElementParentSummary {
  label?: string;
  reactComponents?: string[];
  role?: string;
  selector: string;
  tagName: string;
}

/**
 * Collected element context for agent prompts after pick + redaction.
 *
 * Sensitive input values (password / email / tel / cc-* / one-time-code)
 * are never included in `attributes`, `text`, or any other field.
 */
export interface DesignElement {
  /** Safe attributes only; `value` is omitted when sensitive. */
  attributes?: Record<string, string>;
  computedStyles?: Record<string, string>;
  href?: string;
  label?: string;
  /** Ancestor summaries (nearest parent first). No values. */
  parents?: DesignElementParentSummary[];
  reactComponents?: string[];
  rect: DesignRect;
  role?: string;
  selector: string;
  tagName: string;
  testId?: string;
  text?: string;
}

/** CSS draft change from the inspector (stage 4). */
export interface DesignChange {
  property: string;
  value: string;
}

export type DesignModeErrorCode =
  | "origin-not-allowed"
  | "instance-missing"
  | "not-active"
  | "unknown";

/**
 * Host-facing Design Mode events. Main always stamps `browserViewId` and
 * `origin` from trusted webContents state — never from guest-reported values.
 */
export type DesignRuntimeEvent =
  | {
      browserViewId: string;
      origin: string;
      type: "started";
    }
  | {
      browserViewId: string;
      origin: string;
      type: "stopped";
    }
  | {
      browserViewId: string;
      code: DesignModeErrorCode;
      message: string;
      origin: string;
      type: "error";
    }
  | {
      anchor: DesignAnchor;
      browserViewId: string;
      changes?: DesignChange[];
      element?: DesignElement;
      origin: string;
      type: "selection";
    };

/** Guest → main payload before main stamps browserViewId/origin. */
export type DesignGuestEvent =
  | { type: "started" }
  | { type: "stopped" }
  | {
      anchor: DesignAnchor;
      changes?: DesignChange[];
      element?: DesignElement;
      type: "selection";
    };

export type DesignGuestCommand =
  | { outputDetail?: DesignOutputDetail; type: "start" }
  | { type: "stop" }
  | { outputDetail: DesignOutputDetail; type: "setOutputDetail" };

export interface WorkspaceBrowserDesignStartInput
  extends WorkspaceBrowserCommandInput {
  /** Capture detail tier; default `standard` when omitted. */
  outputDetail?: DesignOutputDetail;
}

export interface WorkspaceBrowserDesignStopInput
  extends WorkspaceBrowserCommandInput {}

export interface WorkspaceBrowserDesignSetAllowedOriginsInput
  extends WorkspaceBrowserCommandInput {
  /** Extra origins (e.g. `http://192.168.1.10:5173`) beyond default localhost. */
  origins: string[];
}

export interface WorkspaceBrowserDesignState {
  active: boolean;
  /** True when the current page origin is allowlisted for Design Mode. */
  allowed: boolean;
  /** Trusted origin from webContents URL, or null when blank/unparsed. */
  origin: string | null;
}

export interface WorkspaceBrowserDesignStartResult {
  ok: true;
  state: WorkspaceBrowserDesignState;
}

export interface WorkspaceBrowserDesignStartDeniedResult {
  code: DesignModeErrorCode;
  message: string;
  ok: false;
  state: WorkspaceBrowserDesignState;
}

export type WorkspaceBrowserDesignStartOutcome =
  | WorkspaceBrowserDesignStartResult
  | WorkspaceBrowserDesignStartDeniedResult;

export interface WorkspaceBrowserApi {
  attach: (
    input: WorkspaceBrowserAttachInput,
  ) => Promise<WorkspaceBrowserState>;
  create: (
    input: WorkspaceBrowserCreateInput,
  ) => Promise<WorkspaceBrowserState>;
  destroy: (
    input: WorkspaceBrowserCommandInput,
  ) => Promise<WorkspaceBrowserOkResult>;
  detach: (
    input: WorkspaceBrowserDetachInput,
  ) => Promise<WorkspaceBrowserOkResult>;
  getDesignState: (
    input: WorkspaceBrowserCommandInput,
  ) => Promise<WorkspaceBrowserDesignState>;
  getState: (
    input: WorkspaceBrowserCommandInput,
  ) => Promise<WorkspaceBrowserState>;
  goBack: (
    input: WorkspaceBrowserCommandInput,
  ) => Promise<WorkspaceBrowserState>;
  goForward: (
    input: WorkspaceBrowserCommandInput,
  ) => Promise<WorkspaceBrowserState>;
  navigate: (
    input: WorkspaceBrowserNavigateInput,
  ) => Promise<WorkspaceBrowserState>;
  onDesignEvent: (
    browserViewId: string,
    handler: (event: DesignRuntimeEvent) => void,
  ) => () => void;
  onEvent: (
    browserViewId: string,
    handler: (event: WorkspaceBrowserEvent) => void,
  ) => () => void;
  reload: (
    input: WorkspaceBrowserCommandInput,
  ) => Promise<WorkspaceBrowserState>;
  setBounds: (
    input: WorkspaceBrowserSetBoundsInput,
  ) => Promise<WorkspaceBrowserState>;
  setDesignAllowedOrigins: (
    input: WorkspaceBrowserDesignSetAllowedOriginsInput,
  ) => Promise<WorkspaceBrowserDesignState>;
  startDesignMode: (
    input: WorkspaceBrowserDesignStartInput,
  ) => Promise<WorkspaceBrowserDesignStartOutcome>;
  stopDesignMode: (
    input: WorkspaceBrowserDesignStopInput,
  ) => Promise<WorkspaceBrowserDesignState>;
}

/**
 * Built-in Design Mode allowlist: loopback preview hosts only.
 * Extra project/dev-server origins are registered via
 * `setDesignAllowedOrigins` and are never inferred from guest-reported data.
 */
export function isDefaultDesignModeAllowedHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) {
    return false;
  }
  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }
  if (host === "127.0.0.1" || host === "[::1]" || host === "::1") {
    return true;
  }
  return false;
}

export function designModeOriginFromUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed || trimmed === "about:blank") {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isDesignModeAllowedOrigin(
  urlOrOrigin: string,
  extraOrigins: readonly string[] = [],
): boolean {
  const origin =
    designModeOriginFromUrl(urlOrOrigin) ?? normalizeOrigin(urlOrOrigin);
  if (!origin) {
    return false;
  }

  try {
    const hostname = new URL(origin).hostname;
    if (isDefaultDesignModeAllowedHost(hostname)) {
      return true;
    }
  } catch {
    return false;
  }

  const allowed = new Set(
    extraOrigins
      .map((candidate) => normalizeOrigin(candidate))
      .filter((candidate): candidate is string => candidate !== null),
  );
  return allowed.has(origin);
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(
      trimmed.includes("://") ? trimmed : `http://${trimmed}`,
    );
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}
