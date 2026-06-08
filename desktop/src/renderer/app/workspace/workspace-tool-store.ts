import type {
  WorkspaceToolHost,
  WorkspaceToolInstance,
  WorkspaceToolInstanceInput,
} from "@shared/workspace-tool-instances";

import { create } from "zustand";

interface WorkspaceToolState {
  activeDialogToolId?: string;
  closeDialogTools: () => void;
  closeWorkspaceTool: (toolId: string) => void;
  findBrowserToolByViewId: (
    browserViewId: string,
  ) => WorkspaceToolInstance | undefined;
  findTerminalToolBySessionId: (
    sessionId: string,
  ) => WorkspaceToolInstance | undefined;
  instances: Record<string, WorkspaceToolInstance>;
  openWorkspaceTool: (
    input: WorkspaceToolInstanceInput,
    host?: WorkspaceToolHost,
  ) => WorkspaceToolInstance;
  registerWorkspaceToolInstance: (instance: WorkspaceToolInstance) => void;
  setActiveDialogTool: (toolId: string) => void;
  setWorkspaceToolRoot: (root?: string | null) => void;
  setWorkspaceToolHost: (toolId: string, host: WorkspaceToolHost) => void;
}

export const useWorkspaceToolStore = create<WorkspaceToolState>()(
  (set, get) => ({
    activeDialogToolId: undefined,
    closeDialogTools: () =>
      set((current) => {
        const instances = Object.fromEntries(
          Object.entries(current.instances).filter(
            ([, instance]) => instance.host !== "dialog",
          ),
        );

        if (
          current.activeDialogToolId === undefined &&
          Object.keys(instances).length ===
            Object.keys(current.instances).length
        ) {
          return current;
        }

        return {
          activeDialogToolId: undefined,
          instances,
        };
      }),
    closeWorkspaceTool: (toolId) =>
      set((current) => {
        const { [toolId]: _closedInstance, ...instances } = current.instances;
        const nextActiveDialogToolId =
          current.activeDialogToolId === toolId
            ? Object.values(instances).find(
                (instance) => instance.host === "dialog",
              )?.id
            : current.activeDialogToolId;

        return {
          activeDialogToolId: nextActiveDialogToolId,
          instances,
        };
      }),
    findBrowserToolByViewId: (browserViewId) =>
      Object.values(get().instances).find(
        (instance) =>
          instance.kind === "browser" &&
          instance.browserViewId === browserViewId,
      ),
    findTerminalToolBySessionId: (sessionId) =>
      Object.values(get().instances).find(
        (instance) =>
          instance.kind === "terminal" && instance.sessionId === sessionId,
      ),
    instances: {},
    openWorkspaceTool: (input, host = "dialog") => {
      const instance = {
        ...input,
        host,
        id: crypto.randomUUID(),
      } as WorkspaceToolInstance;

      set((current) => ({
        activeDialogToolId:
          host === "dialog" ? instance.id : current.activeDialogToolId,
        instances: {
          ...current.instances,
          [instance.id]: instance,
        },
      }));

      return instance;
    },
    registerWorkspaceToolInstance: (instance) => {
      const previousInstance = get().instances[instance.id];
      if (previousInstance === instance) {
        return;
      }

      killReplacedTerminalSession(previousInstance, instance);
      set((current) => ({
        activeDialogToolId:
          instance.host === "dialog" ? instance.id : current.activeDialogToolId,
        instances: {
          ...current.instances,
          [instance.id]: instance,
        },
      }));
    },
    setActiveDialogTool: (toolId) => {
      const instance = get().instances[toolId];
      if (!instance || instance.host !== "dialog") {
        return;
      }
      if (get().activeDialogToolId === toolId) {
        return;
      }

      set({ activeDialogToolId: toolId });
    },
    setWorkspaceToolRoot: (root) => {
      if (!root) {
        return;
      }

      const replacedTerminalSessionIds: string[] = [];
      set((current) => {
        let changed = false;
        const instances = Object.fromEntries(
          Object.entries(current.instances).map(([toolId, instance]) => {
            const nextInstance = workspaceToolInstanceWithRoot(instance, root);
            if (nextInstance !== instance) {
              changed = true;
            }
            if (
              instance.kind === "terminal" &&
              nextInstance.kind === "terminal" &&
              instance.sessionId !== nextInstance.sessionId
            ) {
              replacedTerminalSessionIds.push(instance.sessionId);
            }

            return [toolId, nextInstance];
          }),
        );

        return changed ? { instances } : current;
      });
      for (const sessionId of replacedTerminalSessionIds) {
        window.terminal.kill({ sessionId });
      }
    },
    setWorkspaceToolHost: (toolId, host) => {
      const instance = get().instances[toolId];
      if (!instance) return;
      if (instance.host === host) return;

      set((current) => ({
        activeDialogToolId:
          host === "dialog"
            ? toolId
            : current.activeDialogToolId === toolId
              ? undefined
              : current.activeDialogToolId,
        instances: {
          ...current.instances,
          [toolId]: { ...instance, host } as WorkspaceToolInstance,
        },
      }));
    },
  }),
);

let workspaceToolWindowEventsInitialized = false;

export function ensureWorkspaceToolWindowEvents() {
  if (workspaceToolWindowEventsInitialized) {
    return;
  }
  workspaceToolWindowEventsInitialized = true;

  window.desktopWindow.onWorkspaceToolWindowClosed((toolId) => {
    useWorkspaceToolStore.getState().closeWorkspaceTool(toolId);
  });
  window.desktopWindow.onWorkspaceToolDialogRequested((instance) => {
    useWorkspaceToolStore.getState().registerWorkspaceToolInstance(instance);
  });
  window.desktopWindow.onWorkspaceToolInstanceUpdated((instance) => {
    useWorkspaceToolStore.getState().registerWorkspaceToolInstance(instance);
  });
}

function workspaceToolInstanceWithRoot(
  instance: WorkspaceToolInstance,
  root: string,
): WorkspaceToolInstance {
  if (instance.kind === "browser" || instance.root === root) {
    return instance;
  }

  if (instance.kind === "terminal") {
    return {
      ...instance,
      root,
      sessionId: crypto.randomUUID(),
    };
  }

  return {
    ...instance,
    root,
  };
}

function killReplacedTerminalSession(
  previous: WorkspaceToolInstance | undefined,
  next: WorkspaceToolInstance,
) {
  if (
    previous?.kind !== "terminal" ||
    next.kind !== "terminal" ||
    previous.sessionId === next.sessionId
  ) {
    return;
  }

  window.terminal.kill({ sessionId: previous.sessionId });
}
