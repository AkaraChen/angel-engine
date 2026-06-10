import type {
  WorkspaceToolSurfaceContext,
  WorkspaceToolSurfaceContextSetInput,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceHostSetInput,
  WorkspaceToolSurfaceSnapshot,
  WorkspaceToolSurfaceSnapshotSetInput,
  WorkspaceToolSurfaceState,
} from "../../shared/workspace-tool-surface";
import type { WorkspaceToolContextSetInput } from "../../shared/workspace-tool-instances";

import path from "node:path";
import { BrowserWindow, ipcMain } from "electron";

import {
  DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_CLOSE_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_REGISTER_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_CHANGED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_CONTEXT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_FOCUS_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_GET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_HOST_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_SNAPSHOT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL,
} from "../../shared/desktop-window";
import { createDesktopWindow } from "./factory";

const workspaceToolWindowStateFileName = "workspace-tool-window-state.json";
const workspaceToolWindowHash = "/workspace-tools";

const workspaceToolSnapshots = new Map<string, WorkspaceToolSurfaceSnapshot>();

let workspaceToolContext: WorkspaceToolSurfaceContext = {};
let workspaceToolHost: WorkspaceToolSurfaceHost = "sidebar";
let workspaceToolWindow: BrowserWindow | null = null;
let closingWorkspaceToolWindowForHostChange = false;

export function registerWorkspaceToolWindowIpc() {
  ipcMain.handle(DESKTOP_WORKSPACE_TOOL_SURFACE_GET_CHANNEL, () =>
    workspaceToolSurfaceState(),
  );

  ipcMain.on(
    DESKTOP_WORKSPACE_TOOL_SURFACE_CONTEXT_SET_CHANNEL,
    (_event, input: WorkspaceToolSurfaceContextSetInput) => {
      setWorkspaceToolSurfaceContext(input);
    },
  );

  ipcMain.on(
    DESKTOP_WORKSPACE_TOOL_SURFACE_HOST_SET_CHANNEL,
    (_event, input: WorkspaceToolSurfaceHostSetInput) => {
      setWorkspaceToolSurfaceHost(input.host);
    },
  );

  ipcMain.on(
    DESKTOP_WORKSPACE_TOOL_SURFACE_SNAPSHOT_SET_CHANNEL,
    (_event, input: WorkspaceToolSurfaceSnapshotSetInput) => {
      workspaceToolSnapshots.set(input.chatId, input.snapshot);
      broadcastWorkspaceToolSurfaceState();
    },
  );

  ipcMain.on(DESKTOP_WORKSPACE_TOOL_SURFACE_FOCUS_CHANNEL, () => {
    focusWorkspaceToolSurface();
  });

  ipcMain.on(DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  registerLegacyWorkspaceToolIpc();
}

function registerLegacyWorkspaceToolIpc() {
  ipcMain.handle(DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL, () => null);
  ipcMain.on(
    DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL,
    (_event, context: WorkspaceToolContextSetInput) => {
      setWorkspaceToolSurfaceContext({
        ...workspaceToolContext,
        root: context.root,
      });
    },
  );
  ipcMain.on(DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL, () => {
    setWorkspaceToolSurfaceHost("window");
  });
  ipcMain.on(DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL, () => {
    setWorkspaceToolSurfaceHost("dialog");
  });
  ipcMain.on(DESKTOP_WORKSPACE_TOOL_INSTANCE_REGISTER_CHANNEL, () => {});
  ipcMain.on(DESKTOP_WORKSPACE_TOOL_INSTANCE_CLOSE_CHANNEL, () => {});
}

function setWorkspaceToolSurfaceContext(context: WorkspaceToolSurfaceContext) {
  if (
    context.chatId === workspaceToolContext.chatId &&
    context.root === workspaceToolContext.root
  ) {
    return;
  }

  workspaceToolContext = context;
  updateWorkspaceToolWindowTitle();
  broadcastWorkspaceToolSurfaceState();
}

function setWorkspaceToolSurfaceHost(host: WorkspaceToolSurfaceHost) {
  if (host === "window") {
    workspaceToolHost = "window";
    ensureWorkspaceToolWindow();
    broadcastWorkspaceToolSurfaceState();
    return;
  }

  workspaceToolHost = host;
  closeWorkspaceToolWindowForHostChange();
  broadcastWorkspaceToolSurfaceState();
}

function focusWorkspaceToolSurface() {
  if (workspaceToolHost === "window") {
    ensureWorkspaceToolWindow();
  }
}

function ensureWorkspaceToolWindow() {
  const existingWindow = workspaceToolWindow;
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.setTitle(workspaceToolWindowTitle());
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
    hash: workspaceToolWindowHash,
    options: {
      height: 720,
      minHeight: 420,
      minWidth: 640,
      show: true,
      title: workspaceToolWindowTitle(),
      width: 1040,
    },
    stateFileName: workspaceToolWindowStateFileName,
  });

  workspaceToolWindow = window;
  lockWorkspaceToolWindowTitle(window);
  window.on("closed", () => {
    workspaceToolWindow = null;
    if (closingWorkspaceToolWindowForHostChange) {
      closingWorkspaceToolWindowForHostChange = false;
      return;
    }

    if (workspaceToolHost === "window") {
      workspaceToolHost = "sidebar";
      broadcastWorkspaceToolSurfaceState();
    }
  });

  return window;
}

function closeWorkspaceToolWindowForHostChange() {
  const window = workspaceToolWindow;
  if (!window || window.isDestroyed()) {
    workspaceToolWindow = null;
    return;
  }

  closingWorkspaceToolWindowForHostChange = true;
  window.close();
}

function workspaceToolSurfaceState(): WorkspaceToolSurfaceState {
  const chatId = workspaceToolContext.chatId ?? undefined;

  return {
    context: workspaceToolContext,
    host: workspaceToolHost,
    snapshot: chatId ? (workspaceToolSnapshots.get(chatId) ?? null) : null,
  };
}

function broadcastWorkspaceToolSurfaceState() {
  const state = workspaceToolSurfaceState();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(
        DESKTOP_WORKSPACE_TOOL_SURFACE_CHANGED_CHANNEL,
        state,
      );
    }
  }
}

function lockWorkspaceToolWindowTitle(window: BrowserWindow) {
  window.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    updateWorkspaceToolWindowTitle();
  });
  updateWorkspaceToolWindowTitle();
}

function updateWorkspaceToolWindowTitle() {
  const window = workspaceToolWindow;
  if (!window || window.isDestroyed()) {
    return;
  }

  window.setTitle(workspaceToolWindowTitle());
}

function workspaceToolWindowTitle() {
  const root = workspaceToolContext.root;
  const rootName = root ? path.basename(root) || root : undefined;

  return rootName
    ? `Angel Engine · Workspace tools · ${rootName}`
    : "Angel Engine · Workspace tools";
}

export function openWorkspaceToolWindow() {
  return setWorkspaceToolSurfaceHost("window");
}
