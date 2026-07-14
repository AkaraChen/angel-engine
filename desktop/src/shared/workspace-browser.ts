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

export function workspaceBrowserEventChannel(browserViewId: string) {
  return `workspace-browser:event:${browserViewId}`;
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
}
