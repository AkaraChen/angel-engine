import type { IpcRendererEvent } from "electron";
import type {
  DesignRuntimeEvent,
  WorkspaceBrowserApi,
  WorkspaceBrowserAttachInput,
  WorkspaceBrowserCommandInput,
  WorkspaceBrowserCreateInput,
  WorkspaceBrowserDesignCaptureScreenshotInput,
  WorkspaceBrowserDesignSetAllowedOriginsInput,
  WorkspaceBrowserDesignSetDraftInput,
  WorkspaceBrowserDesignSetFrozenInput,
  WorkspaceBrowserDesignStartInput,
  WorkspaceBrowserDesignStopInput,
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
  WORKSPACE_BROWSER_DESIGN_CAPTURE_SCREENSHOT_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_GET_STATE_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_SET_ALLOWED_ORIGINS_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_SET_DRAFT_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_SET_FROZEN_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_START_CHANNEL,
  WORKSPACE_BROWSER_DESIGN_STOP_CHANNEL,
  WORKSPACE_BROWSER_GET_STATE_CHANNEL,
  WORKSPACE_BROWSER_GO_BACK_CHANNEL,
  WORKSPACE_BROWSER_GO_FORWARD_CHANNEL,
  WORKSPACE_BROWSER_NAVIGATE_CHANNEL,
  WORKSPACE_BROWSER_RELOAD_CHANNEL,
  WORKSPACE_BROWSER_SET_BOUNDS_CHANNEL,
  workspaceBrowserDesignEventChannel,
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
    async captureDesignScreenshot(
      input: WorkspaceBrowserDesignCaptureScreenshotInput,
    ) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESIGN_CAPTURE_SCREENSHOT_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["captureDesignScreenshot"]>;
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
    async getDesignState(input: WorkspaceBrowserCommandInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESIGN_GET_STATE_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["getDesignState"]>;
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
    onDesignEvent(
      browserViewId: string,
      handler: (event: DesignRuntimeEvent) => void,
    ) {
      const channel = workspaceBrowserDesignEventChannel(browserViewId);
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (isDesignRuntimeEvent(payload)) {
          handler(payload);
        }
      };

      ipcRenderer.on(channel, listener);
      return () => {
        ipcRenderer.removeListener(channel, listener);
      };
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
    async setDesignAllowedOrigins(
      input: WorkspaceBrowserDesignSetAllowedOriginsInput,
    ) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESIGN_SET_ALLOWED_ORIGINS_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["setDesignAllowedOrigins"]>;
    },
    async setDesignDraft(input: WorkspaceBrowserDesignSetDraftInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESIGN_SET_DRAFT_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["setDesignDraft"]>;
    },
    async setDesignFrozen(input: WorkspaceBrowserDesignSetFrozenInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESIGN_SET_FROZEN_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["setDesignFrozen"]>;
    },
    async startDesignMode(input: WorkspaceBrowserDesignStartInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESIGN_START_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["startDesignMode"]>;
    },
    async stopDesignMode(input: WorkspaceBrowserDesignStopInput) {
      return ipcRenderer.invoke(
        WORKSPACE_BROWSER_DESIGN_STOP_CHANNEL,
        input,
      ) as ReturnType<WorkspaceBrowserApi["stopDesignMode"]>;
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

function isDesignRuntimeEvent(value: unknown): value is DesignRuntimeEvent {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const event = value as Partial<DesignRuntimeEvent>;
  if (
    typeof event.browserViewId !== "string" ||
    typeof event.origin !== "string" ||
    typeof event.type !== "string"
  ) {
    return false;
  }

  return (
    event.type === "started" ||
    event.type === "stopped" ||
    event.type === "error" ||
    event.type === "selection"
  );
}
