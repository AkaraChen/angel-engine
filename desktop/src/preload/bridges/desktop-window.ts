import type { IpcRendererEvent } from "electron";
import type {
  DesktopConfirmDeleteArchivedChatsInput,
  DesktopConfirmDeleteCustomAgentInput,
  DesktopOpenChatFromNotificationEvent,
  DesktopThemeSetInput,
  DesktopUpdateDownloadedEvent,
  DesktopWindowCommand,
} from "../../shared/desktop-window";
import type {
  WorkspaceToolContextSetInput,
  WorkspaceToolInstance,
  WorkspaceToolInstanceCloseInput,
  WorkspaceToolWindowOpenInput,
} from "../../shared/workspace-tool-instances";

import { contextBridge, ipcRenderer } from "electron";
import {
  DESKTOP_ACTIVE_CHAT_SET_CHANNEL,
  DESKTOP_COMMAND_CHANNEL,
  DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL,
  DESKTOP_CONFIRM_DELETE_ARCHIVED_CHATS_CHANNEL,
  DESKTOP_CONFIRM_DELETE_CUSTOM_AGENT_CHANNEL,
  DESKTOP_INSTALL_UPDATE_CHANNEL,
  DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
  DESKTOP_SETTINGS_OPEN_CHANNEL,
  DESKTOP_THEME_SET_CHANNEL,
  DESKTOP_UPDATE_DOWNLOADED_CHANNEL,
  DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_CHANGED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_CONTEXT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_FOCUS_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_GET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_HOST_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_SNAPSHOT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_CLOSE_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_REGISTER_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_UPDATED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_CLOSED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL,
} from "../../shared/desktop-window";
import type {
  WorkspaceToolSurfaceContextSetInput,
  WorkspaceToolSurfaceHostSetInput,
  WorkspaceToolSurfaceSnapshotSetInput,
  WorkspaceToolSurfaceState,
} from "../../shared/workspace-tool-surface";

export function exposeDesktopWindowBridge() {
  contextBridge.exposeInMainWorld("desktopWindow", {
    async confirmDeleteAllChats() {
      return ipcRenderer.invoke(DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL);
    },
    async confirmDeleteArchivedChats(
      input: DesktopConfirmDeleteArchivedChatsInput,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_CONFIRM_DELETE_ARCHIVED_CHATS_CHANNEL,
        input,
      );
    },
    async confirmDeleteCustomAgent(
      input: DesktopConfirmDeleteCustomAgentInput,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_CONFIRM_DELETE_CUSTOM_AGENT_CHANNEL,
        input,
      );
    },
    closeCurrent() {
      ipcRenderer.send(DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL);
    },
    onCommand(handler: (command: DesktopWindowCommand) => void) {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (!isDesktopWindowCommandEvent(payload)) return;
        handler(payload.command);
      };

      ipcRenderer.on(DESKTOP_COMMAND_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(DESKTOP_COMMAND_CHANNEL, listener);
      };
    },
    onOpenChatFromNotification(
      handler: (event: DesktopOpenChatFromNotificationEvent) => void,
    ) {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (!isOpenChatFromNotificationEvent(payload)) return;
        handler(payload);
      };

      ipcRenderer.on(DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
          listener,
        );
      };
    },
    onUpdateDownloaded(handler: (event: DesktopUpdateDownloadedEvent) => void) {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (!isUpdateDownloadedEvent(payload)) return;
        handler(payload);
      };

      ipcRenderer.on(DESKTOP_UPDATE_DOWNLOADED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(DESKTOP_UPDATE_DOWNLOADED_CHANNEL, listener);
      };
    },
    onWorkspaceToolWindowClosed(handler: (toolId: string) => void) {
      const listener = (
        _event: IpcRendererEvent,
        payload: WorkspaceToolInstanceCloseInput,
      ) => {
        handler(payload.toolId);
      };

      ipcRenderer.on(DESKTOP_WORKSPACE_TOOL_WINDOW_CLOSED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_WORKSPACE_TOOL_WINDOW_CLOSED_CHANNEL,
          listener,
        );
      };
    },
    onWorkspaceToolDialogRequested(
      handler: (instance: WorkspaceToolInstance) => void,
    ) {
      const listener = (
        _event: IpcRendererEvent,
        payload: WorkspaceToolInstance,
      ) => {
        handler(payload);
      };

      ipcRenderer.on(DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL,
          listener,
        );
      };
    },
    onWorkspaceToolInstanceUpdated(
      handler: (instance: WorkspaceToolInstance) => void,
    ) {
      const listener = (
        _event: IpcRendererEvent,
        payload: WorkspaceToolInstance,
      ) => {
        handler(payload);
      };

      ipcRenderer.on(DESKTOP_WORKSPACE_TOOL_INSTANCE_UPDATED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_WORKSPACE_TOOL_INSTANCE_UPDATED_CHANNEL,
          listener,
        );
      };
    },
    onWorkspaceToolSurfaceChanged(
      handler: (state: WorkspaceToolSurfaceState) => void,
    ) {
      const listener = (
        _event: IpcRendererEvent,
        payload: WorkspaceToolSurfaceState,
      ) => {
        handler(payload);
      };

      ipcRenderer.on(DESKTOP_WORKSPACE_TOOL_SURFACE_CHANGED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_WORKSPACE_TOOL_SURFACE_CHANGED_CHANNEL,
          listener,
        );
      };
    },
    async installUpdate() {
      return ipcRenderer.invoke(DESKTOP_INSTALL_UPDATE_CHANNEL);
    },
    openSettings() {
      ipcRenderer.send(DESKTOP_SETTINGS_OPEN_CHANNEL);
    },
    async getWorkspaceToolWindowInstance(toolId: string) {
      return ipcRenderer.invoke(
        DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL,
        toolId,
      ) as Promise<WorkspaceToolInstance | null>;
    },
    async getWorkspaceToolSurfaceState() {
      return ipcRenderer.invoke(
        DESKTOP_WORKSPACE_TOOL_SURFACE_GET_CHANNEL,
      ) as Promise<WorkspaceToolSurfaceState>;
    },
    openWorkspaceToolWindow(input: WorkspaceToolWindowOpenInput) {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL, input);
    },
    openWorkspaceToolDialog(input: WorkspaceToolWindowOpenInput) {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_DIALOG_OPEN_CHANNEL, input);
    },
    closeWorkspaceToolInstance(input: WorkspaceToolInstanceCloseInput) {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_INSTANCE_CLOSE_CHANNEL, input);
    },
    registerWorkspaceToolWindowInstance(input: WorkspaceToolWindowOpenInput) {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_INSTANCE_REGISTER_CHANNEL, input);
    },
    focusWorkspaceToolSurface() {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_SURFACE_FOCUS_CHANNEL);
    },
    setActiveChatId(chatId: string | null) {
      ipcRenderer.send(DESKTOP_ACTIVE_CHAT_SET_CHANNEL, chatId);
    },
    setTheme(input: DesktopThemeSetInput) {
      ipcRenderer.send(DESKTOP_THEME_SET_CHANNEL, input);
    },
    setWorkspaceToolContext(input: WorkspaceToolContextSetInput) {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL, input);
    },
    setWorkspaceToolSurfaceContext(input: WorkspaceToolSurfaceContextSetInput) {
      ipcRenderer.send(
        DESKTOP_WORKSPACE_TOOL_SURFACE_CONTEXT_SET_CHANNEL,
        input,
      );
    },
    setWorkspaceToolSurfaceHost(input: WorkspaceToolSurfaceHostSetInput) {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_SURFACE_HOST_SET_CHANNEL, input);
    },
    setWorkspaceToolSurfaceSnapshot(
      input: WorkspaceToolSurfaceSnapshotSetInput,
    ) {
      ipcRenderer.send(
        DESKTOP_WORKSPACE_TOOL_SURFACE_SNAPSHOT_SET_CHANNEL,
        input,
      );
    },
  });
}

function isDesktopWindowCommandEvent(
  value: unknown,
): value is { command: DesktopWindowCommand } {
  if (typeof value !== "object" || value === null) return false;
  const command = (value as { command?: unknown }).command;
  return (
    command === "new-chat" ||
    command === "open-settings" ||
    command === "toggle-sidebar"
  );
}

function isOpenChatFromNotificationEvent(
  value: unknown,
): value is DesktopOpenChatFromNotificationEvent {
  if (typeof value !== "object" || value === null) return false;
  return typeof (value as { chatId?: unknown }).chatId === "string";
}

function isUpdateDownloadedEvent(
  value: unknown,
): value is DesktopUpdateDownloadedEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as { releaseName?: unknown; releaseNotes?: unknown };
  return (
    typeof event.releaseName === "string" &&
    (event.releaseNotes === undefined || typeof event.releaseNotes === "string")
  );
}
