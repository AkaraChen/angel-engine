import type {
  WorkspaceToolSurfaceContext,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
  WorkspaceToolSurfaceState,
} from "../../shared/workspace-tool-surface";

import path from "node:path";
import is from "@sindresorhus/is";
import { type } from "arktype";
import { BrowserWindow, ipcMain, screen } from "electron";
import log from "electron-log/main";

import {
  DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL,
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
const workspaceToolWindowMinimumBounds = { height: 420, width: 640 };
const workspaceToolWindowTrafficLightPosition = { x: 16, y: 16 };
export const WORKSPACE_TOOL_SNAPSHOT_LIMIT = 32;

const workspaceToolSurfaceContextSetInput = type({
  "+": "ignore",
  "chatId?": "string | null | undefined",
  "root?": "string | null | undefined",
});

const workspaceToolSurfaceHostSetInput = type({
  "+": "ignore",
  host: "'sidebar' | 'window'",
});

const workspaceToolSurfaceSnapshotSetInput = type({
  "+": "ignore",
  chatId: "string > 0",
  snapshot: "object",
});

const legacyWorkspaceToolContextSetInput = type({
  "+": "ignore",
  "root?": "string | null | undefined",
});

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
    (_event, raw: unknown) => {
      const input = workspaceToolSurfaceContextSetInput(raw);
      if (input instanceof type.errors) {
        log.warn("Rejected workspace-tool surface context IPC.", {
          summary: input.summary,
        });
        return;
      }
      setWorkspaceToolSurfaceContext(input);
    },
  );

  ipcMain.on(
    DESKTOP_WORKSPACE_TOOL_SURFACE_HOST_SET_CHANNEL,
    (event, raw: unknown) => {
      const input = workspaceToolSurfaceHostSetInput(raw);
      if (input instanceof type.errors) {
        log.warn("Rejected workspace-tool surface host IPC.", {
          summary: input.summary,
        });
        return;
      }
      setWorkspaceToolSurfaceHost(
        input.host,
        BrowserWindow.fromWebContents(event.sender) ?? undefined,
      );
    },
  );

  ipcMain.on(
    DESKTOP_WORKSPACE_TOOL_SURFACE_SNAPSHOT_SET_CHANNEL,
    (_event, raw: unknown) => {
      const input = workspaceToolSurfaceSnapshotSetInput(raw);
      if (input instanceof type.errors) {
        log.warn("Rejected workspace-tool surface snapshot IPC.", {
          summary: input.summary,
        });
        return;
      }
      workspaceToolSnapshots.set(
        input.chatId,
        input.snapshot as WorkspaceToolSurfaceSnapshot,
      );
      trimWorkspaceToolSnapshots(workspaceToolSnapshots);
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
    (_event, raw: unknown) => {
      const context = legacyWorkspaceToolContextSetInput(raw);
      if (context instanceof type.errors) {
        log.warn("Rejected legacy workspace-tool context IPC.", {
          summary: context.summary,
        });
        return;
      }
      setWorkspaceToolSurfaceContext({
        ...workspaceToolContext,
        root: context.root,
      });
    },
  );
  ipcMain.on(DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL, (event) => {
    setWorkspaceToolSurfaceHost(
      "window",
      BrowserWindow.fromWebContents(event.sender) ?? undefined,
    );
  });
  ipcMain.on(DESKTOP_WORKSPACE_TOOL_INSTANCE_REGISTER_CHANNEL, () => {});
  ipcMain.on(DESKTOP_WORKSPACE_TOOL_INSTANCE_CLOSE_CHANNEL, () => {});
}

export function trimWorkspaceToolSnapshots<T>(
  snapshots: Map<string, T>,
  limit = WORKSPACE_TOOL_SNAPSHOT_LIMIT,
) {
  while (snapshots.size > limit) {
    const oldest = snapshots.keys().next().value;
    if (oldest === undefined) return;
    snapshots.delete(oldest);
  }
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

function setWorkspaceToolSurfaceHost(
  host: WorkspaceToolSurfaceHost,
  sourceWindow?: BrowserWindow,
) {
  if (host === "window") {
    workspaceToolHost = "window";
    ensureWorkspaceToolWindow(sourceWindow);
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

function ensureWorkspaceToolWindow(sourceWindow?: BrowserWindow) {
  const existingWindow = workspaceToolWindow;
  if (existingWindow && !existingWindow.isDestroyed()) {
    existingWindow.setTitle(workspaceToolWindowTitle());
    existingWindow.show();
    existingWindow.focus();
    return existingWindow;
  }

  const defaultBounds = defaultWorkspaceToolWindowBounds(sourceWindow);
  const window = createDesktopWindow({
    bounds: {
      defaultBounds,
      minimumBounds: workspaceToolWindowMinimumBounds,
      stateFileName: workspaceToolWindowStateFileName,
    },
    hash: workspaceToolWindowHash,
    options: {
      height: defaultBounds.height,
      minHeight: workspaceToolWindowMinimumBounds.height,
      minWidth: workspaceToolWindowMinimumBounds.width,
      show: true,
      title: workspaceToolWindowTitle(),
      width: defaultBounds.width,
    },
    stateFileName: workspaceToolWindowStateFileName,
  });

  if (process.platform === "darwin") {
    window.setWindowButtonPosition(workspaceToolWindowTrafficLightPosition);
  }

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

function defaultWorkspaceToolWindowBounds(sourceWindow?: BrowserWindow) {
  const { workArea } = workspaceToolWindowDisplay(sourceWindow);
  const width = clampWorkspaceToolWindowDimension(
    Math.round(Math.min(1280, workArea.width * 0.9)),
    workspaceToolWindowMinimumBounds.width,
    workArea.width,
  );
  const height = clampWorkspaceToolWindowDimension(
    Math.round(Math.min(820, workArea.height * 0.9)),
    workspaceToolWindowMinimumBounds.height,
    workArea.height,
  );

  return {
    height,
    width,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  };
}

function workspaceToolWindowDisplay(sourceWindow?: BrowserWindow) {
  if (sourceWindow && !sourceWindow.isDestroyed()) {
    return screen.getDisplayMatching(sourceWindow.getBounds());
  }

  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    return screen.getDisplayMatching(focusedWindow.getBounds());
  }

  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function clampWorkspaceToolWindowDimension(
  value: number,
  minimum: number,
  maximum: number,
) {
  return Math.max(minimum, Math.min(value, maximum));
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
    snapshot: is.nonEmptyString(chatId)
      ? (workspaceToolSnapshots.get(chatId) ?? null)
      : null,
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
  const rootName = is.nonEmptyString(root)
    ? is.nonEmptyString(path.basename(root))
      ? path.basename(root)
      : root
    : undefined;

  return is.nonEmptyString(rootName) ? rootName : "Angel Engine";
}
