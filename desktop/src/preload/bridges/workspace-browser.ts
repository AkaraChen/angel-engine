import type { IpcRendererEvent } from "electron";
import type {
  WorkspaceBrowserApi,
  WorkspaceBrowserAttachInput,
  WorkspaceBrowserCommandInput,
  WorkspaceBrowserCreateInput,
  WorkspaceBrowserDetachInput,
  WorkspaceBrowserEvent,
  WorkspaceBrowserNavigateInput,
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
  WORKSPACE_BROWSER_RELOAD_CHANNEL,
  WORKSPACE_BROWSER_SET_BOUNDS_CHANNEL,
  workspaceBrowserEventChannel,
} from "../../shared/workspace-browser";

export function exposeWorkspaceBrowserBridge() {
  const workspaceBrowserApi = {
    attach(input: WorkspaceBrowserAttachInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_ATTACH_CHANNEL, input);
    },
    create(input: WorkspaceBrowserCreateInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_CREATE_CHANNEL, input);
    },
    destroy(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_DESTROY_CHANNEL, input);
    },
    detach(input: WorkspaceBrowserDetachInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_DETACH_CHANNEL, input);
    },
    getState(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_GET_STATE_CHANNEL, input);
    },
    goBack(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_GO_BACK_CHANNEL, input);
    },
    goForward(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_GO_FORWARD_CHANNEL, input);
    },
    navigate(input: WorkspaceBrowserNavigateInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_NAVIGATE_CHANNEL, input);
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
    reload(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_RELOAD_CHANNEL, input);
    },
    setBounds(input: WorkspaceBrowserSetBoundsInput) {
      return ipcRenderer.invoke(WORKSPACE_BROWSER_SET_BOUNDS_CHANNEL, input);
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
  return (
    typeof state === "object" &&
    state !== null &&
    typeof state.canGoBack === "boolean" &&
    typeof state.canGoForward === "boolean" &&
    typeof state.ready === "boolean" &&
    typeof state.title === "string" &&
    typeof state.url === "string"
  );
}
