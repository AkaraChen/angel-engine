import type {
  WorkspaceToolContextSetInput,
  WorkspaceToolInstance,
  WorkspaceToolWindowOpenInput,
} from "../../shared/workspace-tool-instances";

import path from "node:path";
import { randomUUID } from "node:crypto";
import { BrowserWindow, ipcMain } from "electron";

import {
  DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_UPDATED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_CLOSED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL,
} from "../../shared/desktop-window";
import { killTerminalSession } from "../features/terminal/ipc";
import { createDesktopWindow } from "./factory";

const workspaceToolWindowStateFileName = "workspace-tool-window-state.json";

const workspaceToolInstances = new Map<string, WorkspaceToolInstance>();
const workspaceToolWindows = new Map<string, BrowserWindow>();
const workspaceToolDialogTransferIds = new Set<string>();
let currentWorkspaceToolRoot: string | undefined;

export function registerWorkspaceToolWindowIpc() {
  ipcMain.handle(
    DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL,
    (_event, toolId: unknown) => {
      return typeof toolId === "string"
        ? (workspaceToolInstances.get(toolId) ?? null)
        : null;
    },
  );

  ipcMain.on(DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL, (_event, input) => {
    const instance = parseWorkspaceToolWindowOpenInput(input);
    if (!instance) return;

    openWorkspaceToolWindow(instance);
  });

  ipcMain.on(DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL, (_event, input) => {
    const instance = parseWorkspaceToolWindowOpenInput(input);
    if (!instance) return;

    const dialogInstance = { ...instance, host: "dialog" as const };
    workspaceToolInstances.set(dialogInstance.id, dialogInstance);
    workspaceToolDialogTransferIds.add(dialogInstance.id);
    broadcastWorkspaceToolDialogOpen(dialogInstance);
  });

  ipcMain.on(DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  ipcMain.on(DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL, (_event, input) => {
    setWorkspaceToolContext(parseWorkspaceToolContextSetInput(input));
  });
}

export function openWorkspaceToolWindow(instance: WorkspaceToolInstance) {
  const windowInstance = workspaceToolInstanceWithRoot(
    { ...instance, host: "window" },
    currentWorkspaceToolRoot,
  );

  workspaceToolInstances.set(windowInstance.id, windowInstance);

  const existingWindow = workspaceToolWindows.get(windowInstance.id);
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.setTitle(workspaceToolWindowTitle(windowInstance));
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const window = createDesktopWindow({
    bounds: {
      defaultBounds: { height: 720, width: 1040 },
      minimumBounds: { height: 420, width: 640 },
      stateFileName: workspaceToolWindowStateFileName,
    },
    hash: `/workspace-tool/${encodeURIComponent(windowInstance.id)}`,
    options: {
      height: 720,
      minHeight: 420,
      minWidth: 640,
      show: true,
      title: workspaceToolWindowTitle(windowInstance),
      width: 1040,
    },
    stateFileName: workspaceToolWindowStateFileName,
  });

  workspaceToolWindows.set(windowInstance.id, window);
  lockWorkspaceToolWindowTitle(window, windowInstance.id);
  window.on("closed", () => {
    workspaceToolWindows.delete(windowInstance.id);
    if (workspaceToolDialogTransferIds.delete(windowInstance.id)) {
      return;
    }
    workspaceToolInstances.delete(windowInstance.id);
    broadcastWorkspaceToolWindowClosed(windowInstance.id);
  });

  return window;
}

function setWorkspaceToolContext(input: WorkspaceToolContextSetInput) {
  const nextRoot = parseOptionalWorkspaceRoot(input.root);
  if (nextRoot === currentWorkspaceToolRoot) {
    return;
  }

  currentWorkspaceToolRoot = nextRoot;
  if (!nextRoot) {
    return;
  }

  for (const instance of workspaceToolInstances.values()) {
    const nextInstance = workspaceToolInstanceWithRoot(instance, nextRoot);
    if (nextInstance === instance) {
      updateWorkspaceToolWindowTitle(instance.id);
      continue;
    }

    workspaceToolInstances.set(nextInstance.id, nextInstance);
    updateWorkspaceToolWindowTitle(nextInstance.id);
    broadcastWorkspaceToolInstanceUpdated(nextInstance);
  }
}

function workspaceToolInstanceWithRoot(
  instance: WorkspaceToolInstance,
  root: string | undefined,
): WorkspaceToolInstance {
  if (!root || instance.kind === "browser" || instance.root === root) {
    return instance;
  }

  if (instance.kind === "terminal") {
    killTerminalSession(instance.sessionId);
    return {
      ...instance,
      root,
      sessionId: randomUUID(),
    };
  }

  return {
    ...instance,
    root,
  };
}

function lockWorkspaceToolWindowTitle(window: BrowserWindow, toolId: string) {
  window.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    updateWorkspaceToolWindowTitle(toolId);
  });
  updateWorkspaceToolWindowTitle(toolId);
}

function updateWorkspaceToolWindowTitle(toolId: string) {
  const window = workspaceToolWindows.get(toolId);
  const instance = workspaceToolInstances.get(toolId);
  if (!window || window.isDestroyed() || !instance) {
    return;
  }

  window.setTitle(workspaceToolWindowTitle(instance));
}

function workspaceToolWindowTitle(instance: WorkspaceToolInstance) {
  const root = workspaceToolRoot(instance);
  const rootName = root ? path.basename(root) || root : undefined;
  const title = `${workspaceToolKindLabel(instance)}: ${instance.title}`;

  return rootName
    ? `Angel Engine · ${title} · ${rootName}`
    : `Angel Engine · ${title}`;
}

function workspaceToolRoot(instance: WorkspaceToolInstance) {
  return instance.kind === "browser" ? undefined : instance.root;
}

function workspaceToolKindLabel(instance: WorkspaceToolInstance) {
  switch (instance.kind) {
    case "browser":
      return "Browser";
    case "file-preview":
      return "File";
    case "git-diff":
      return "Git";
    case "terminal":
      return "Terminal";
  }
}

function broadcastWorkspaceToolDialogOpen(instance: WorkspaceToolInstance) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(
        DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL,
        instance,
      );
    }
  }
}

function broadcastWorkspaceToolWindowClosed(toolId: string) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(DESKTOP_WORKSPACE_TOOL_WINDOW_CLOSED_CHANNEL, {
        toolId,
      });
    }
  }
}

function broadcastWorkspaceToolInstanceUpdated(
  instance: WorkspaceToolInstance,
) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(
        DESKTOP_WORKSPACE_TOOL_INSTANCE_UPDATED_CHANNEL,
        instance,
      );
    }
  }
}

function parseWorkspaceToolWindowOpenInput(
  input: unknown,
): WorkspaceToolInstance | null {
  if (typeof input !== "object" || input === null) {
    return null;
  }

  const instance = (input as Partial<WorkspaceToolWindowOpenInput>).instance;
  if (typeof instance !== "object" || instance === null) {
    return null;
  }
  if (typeof instance.id !== "string" || typeof instance.title !== "string") {
    return null;
  }

  switch (instance.kind) {
    case "browser":
      return typeof instance.browserViewId === "string" &&
        typeof instance.url === "string"
        ? instance
        : null;
    case "file-preview":
      return typeof instance.root === "string" &&
        typeof instance.path === "string"
        ? instance
        : null;
    case "git-diff":
      return typeof instance.root === "string" ? instance : null;
    case "terminal":
      return typeof instance.root === "string" &&
        typeof instance.sessionId === "string"
        ? instance
        : null;
    default:
      return null;
  }
}

function parseWorkspaceToolContextSetInput(
  input: unknown,
): WorkspaceToolContextSetInput {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const root = (input as Partial<WorkspaceToolContextSetInput>).root;
  return { root: parseOptionalWorkspaceRoot(root) ?? null };
}

function parseOptionalWorkspaceRoot(root: unknown) {
  if (typeof root !== "string") {
    return undefined;
  }

  const trimmedRoot = root.trim();
  return trimmedRoot ? trimmedRoot : undefined;
}
