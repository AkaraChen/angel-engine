import type { IpcRendererEvent } from "electron";
import type {
  WorkspaceBrowserApi,
  WorkspaceBrowserAttachInput,
  WorkspaceBrowserCommandInput,
  WorkspaceBrowserCreateInput,
  WorkspaceBrowserDetachInput,
  WorkspaceBrowserEvent,
  WorkspaceBrowserNavigateInput,
  WorkspaceBrowserOpenExternalInput,
  WorkspaceBrowserSetBoundsInput,
} from "../../shared/workspace-browser";

import { contextBridge, ipcRenderer } from "electron";

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
} from "../../shared/workspace-browser";

export function exposeWorkspaceBrowserBridge() {
  const workspaceBrowserApi = {
    async attach(input: WorkspaceBrowserAttachInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_ATTACH_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["attach"]>;
    },
    async create(input: WorkspaceBrowserCreateInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_CREATE_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["create"]>;
    },
    async destroy(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESTROY_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["destroy"]>;
    },
    async detach(input: WorkspaceBrowserDetachInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DETACH_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["detach"]>;
    },
    async getState(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_GET_STATE_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["getState"]>;
    },
    async goBack(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_GO_BACK_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["goBack"]>;
    },
    async goForward(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_GO_FORWARD_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["goForward"]>;
    },
    async navigate(input: WorkspaceBrowserNavigateInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_NAVIGATE_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["navigate"]>;
    },
    onEvent(
      browserViewId: string,
      handler: (event: WorkspaceBrowserEvent) => void,
    ) {
      const channel = workspaceBrowserEventChannel(browserViewId);
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (isWorkspaceBrowserEvent(payload)) {
          handler(payload);
        }
      };

      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
    },
    async openExternal(input: WorkspaceBrowserOpenExternalInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_OPEN_EXTERNAL_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["openExternal"]>;
    },
    async reload(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_RELOAD_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["reload"]>;
    },
    async setBounds(input: WorkspaceBrowserSetBoundsInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_SET_BOUNDS_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["setBounds"]>;
    },
  } satisfies WorkspaceBrowserApi;

  contextBridge.exposeInMainWorld("workspaceBrowser", workspaceBrowserApi);
}

function isWorkspaceBrowserEvent(
  value: unknown,
): value is WorkspaceBrowserEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Partial<WorkspaceBrowserEvent>;
  if (event.type !== "state") {
    return false;
  }

  const state = event.state;
  if (typeof state !== "object" || state === null) {
    return false;
  }

  return (
    typeof state.canGoBack === "boolean" &&
    typeof state.canGoForward === "boolean" &&
    typeof state.loading === "boolean" &&
    typeof state.ready === "boolean" &&
    typeof state.title === "string" &&
    typeof state.url === "string" &&
    isWorkspaceBrowserErrorField(state.error)
  );
}

function isWorkspaceBrowserErrorField(value: unknown): boolean {
  if (value === null) {
    return true;
  }
  if (typeof value !== "object") {
    return false;
  }
  const error = value as { code?: unknown };
  return (
    error.code === "navigation_failed" ||
    error.code === "offline" ||
    error.code === "unsupported_url" ||
    error.code === "unknown"
  );
}
