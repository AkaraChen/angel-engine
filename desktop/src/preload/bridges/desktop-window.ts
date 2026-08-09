import type { IpcRendererEvent } from "electron";
import type {
  DesktopConfirmDeleteArchivedChatsInput,
  DesktopConfirmDeleteCustomAgentInput,
  DesktopConfirmDeleteManagedWorktreesInput,
  DesktopConfirmSaveWorkspaceFileChangesInput,
  DesktopConfirmSaveWorkspaceFileChangesResult,
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

import type {
  WorkspaceToolSurfaceContextSetInput,
  WorkspaceToolSurfaceHostSetInput,
  WorkspaceToolSurfaceSnapshotSetInput,
  WorkspaceToolSurfaceState,
} from "../../shared/workspace-tool-surface";
import type {
  DesktopNotificationHistory,
  DesktopNotificationPreferences,
  DesktopNotificationPreferencesSetInput,
} from "../../shared/notification-preferences";
import type {
  DesktopUpdateChannelSetInput,
  DesktopUpdateStatus,
} from "../../shared/update-channel";
import type {
  WorkspaceDiffBasePreference,
  WorkspaceDiffBasePreferenceInput,
} from "../../shared/workspace-diff-preferences";
import { contextBridge, ipcRenderer } from "electron";
import { KEYMAP_USER_BINDINGS_CHANGED_CHANNEL } from "../../shared/keybindings/channels";
import {
  DESKTOP_ACTIVE_CHAT_SET_CHANNEL,
  DESKTOP_COMMAND_CHANNEL,
  DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL,
  DESKTOP_CONFIRM_DELETE_ARCHIVED_CHATS_CHANNEL,
  DESKTOP_CONFIRM_DELETE_CUSTOM_AGENT_CHANNEL,
  DESKTOP_CONFIRM_DELETE_MANAGED_WORKTREES_CHANNEL,
  DESKTOP_CONFIRM_SAVE_WORKSPACE_FILE_CHANGES_CHANNEL,
  DESKTOP_INSTALL_UPDATE_CHANNEL,
  DESKTOP_NOTIFICATION_HISTORY_CHANGED_CHANNEL,
  DESKTOP_NOTIFICATION_HISTORY_CLEAR_CHANNEL,
  DESKTOP_NOTIFICATION_HISTORY_GET_CHANNEL,
  DESKTOP_NOTIFICATION_HISTORY_MARK_READ_CHANNEL,
  DESKTOP_NOTIFICATION_PREFERENCES_GET_CHANNEL,
  DESKTOP_NOTIFICATION_PREFERENCES_SET_CHANNEL,
  DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL,
  DESKTOP_SETTINGS_OPEN_CHANNEL,
  DESKTOP_THEME_SET_CHANNEL,
  DESKTOP_UPDATE_CHANNEL_SET_CHANNEL,
  DESKTOP_UPDATE_CHECK_CHANNEL,
  DESKTOP_UPDATE_DOWNLOADED_CHANNEL,
  DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL,
  DESKTOP_UPDATE_STATUS_GET_CHANNEL,
  DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL,
  DESKTOP_WINDOW_CONTENT_READY_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_CLOSE_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_REGISTER_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_INSTANCE_UPDATED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_CHANGED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_CONTEXT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_FOCUS_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_GET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_HOST_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_SURFACE_SNAPSHOT_SET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_CLOSED_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL,
  DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL,
} from "../../shared/desktop-window";
import { isDesktopNotificationHistory } from "../../shared/notification-preferences";
import {
  DESKTOP_WORKSPACE_DIFF_BASE_GET_CHANNEL,
  DESKTOP_WORKSPACE_DIFF_BASE_SET_CHANNEL,
} from "../../shared/workspace-diff-preferences";

export function exposeDesktopWindowBridge() {
  contextBridge.exposeInMainWorld("desktopWindow", {
    async confirmDeleteAllChats() {
      return ipcRenderer.invoke(
        DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL,
      ) as Promise<boolean>;
    },
    async confirmDeleteArchivedChats(
      input: DesktopConfirmDeleteArchivedChatsInput,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_CONFIRM_DELETE_ARCHIVED_CHATS_CHANNEL,
        input,
      ) as Promise<boolean>;
    },
    async confirmDeleteCustomAgent(
      input: DesktopConfirmDeleteCustomAgentInput,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_CONFIRM_DELETE_CUSTOM_AGENT_CHANNEL,
        input,
      ) as Promise<boolean>;
    },
    async confirmDeleteManagedWorktrees(
      input: DesktopConfirmDeleteManagedWorktreesInput,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_CONFIRM_DELETE_MANAGED_WORKTREES_CHANNEL,
        input,
      ) as Promise<boolean>;
    },
    async confirmSaveWorkspaceFileChanges(
      input: DesktopConfirmSaveWorkspaceFileChangesInput,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_CONFIRM_SAVE_WORKSPACE_FILE_CHANGES_CHANNEL,
        input,
      ) as Promise<DesktopConfirmSaveWorkspaceFileChangesResult>;
    },
    closeCurrent() {
      ipcRenderer.send(DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL);
    },
    notifyContentReady() {
      ipcRenderer.send(DESKTOP_WINDOW_CONTENT_READY_CHANNEL);
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
    onKeymapUserBindingsChanged(
      handler: (state: {
        file: { version: 1; bindings: unknown[] };
        warnings: unknown[];
        fatal?: unknown;
        path: string;
      }) => void,
    ) {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (!payload || typeof payload !== "object") return;
        handler(
          payload as {
            file: { version: 1; bindings: unknown[] };
            warnings: unknown[];
            fatal?: unknown;
            path: string;
          },
        );
      };

      ipcRenderer.on(KEYMAP_USER_BINDINGS_CHANGED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          KEYMAP_USER_BINDINGS_CHANGED_CHANNEL,
          listener,
        );
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
    onNotificationHistoryChanged(
      handler: (history: DesktopNotificationHistory) => void,
    ) {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (!isDesktopNotificationHistory(payload)) return;
        handler(payload);
      };

      ipcRenderer.on(DESKTOP_NOTIFICATION_HISTORY_CHANGED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_NOTIFICATION_HISTORY_CHANGED_CHANNEL,
          listener,
        );
      };
    },
    async getNotificationHistory() {
      return ipcRenderer.invoke(
        DESKTOP_NOTIFICATION_HISTORY_GET_CHANNEL,
      ) as Promise<DesktopNotificationHistory>;
    },
    async clearNotificationHistory() {
      return ipcRenderer.invoke(
        DESKTOP_NOTIFICATION_HISTORY_CLEAR_CHANNEL,
      ) as Promise<DesktopNotificationHistory>;
    },
    async markNotificationHistoryRead(ids: string[]) {
      return ipcRenderer.invoke(
        DESKTOP_NOTIFICATION_HISTORY_MARK_READ_CHANNEL,
        { ids },
      ) as Promise<DesktopNotificationHistory>;
    },
    async getNotificationPreferences() {
      return ipcRenderer.invoke(
        DESKTOP_NOTIFICATION_PREFERENCES_GET_CHANNEL,
      ) as Promise<DesktopNotificationPreferences>;
    },
    async setNotificationPreferences(
      input: DesktopNotificationPreferencesSetInput,
    ) {
      return ipcRenderer.invoke(
        DESKTOP_NOTIFICATION_PREFERENCES_SET_CHANNEL,
        input,
      ) as Promise<DesktopNotificationPreferences>;
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
    onUpdateStatusChanged(handler: (status: DesktopUpdateStatus) => void) {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        if (!isUpdateStatus(payload)) return;
        handler(payload);
      };

      ipcRenderer.on(DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL, listener);
      return () => {
        ipcRenderer.removeListener(
          DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL,
          listener,
        );
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
      return ipcRenderer.invoke(
        DESKTOP_INSTALL_UPDATE_CHANNEL,
      ) as Promise<unknown>;
    },
    async getUpdateStatus() {
      return ipcRenderer.invoke(
        DESKTOP_UPDATE_STATUS_GET_CHANNEL,
      ) as Promise<DesktopUpdateStatus>;
    },
    async checkForUpdates() {
      return ipcRenderer.invoke(
        DESKTOP_UPDATE_CHECK_CHANNEL,
      ) as Promise<DesktopUpdateStatus>;
    },
    async setUpdateChannel(input: DesktopUpdateChannelSetInput) {
      return ipcRenderer.invoke(
        DESKTOP_UPDATE_CHANNEL_SET_CHANNEL,
        input,
      ) as Promise<DesktopUpdateStatus>;
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
    async getWorkspaceDiffBase(root: string) {
      return ipcRenderer.invoke(
        DESKTOP_WORKSPACE_DIFF_BASE_GET_CHANNEL,
        root,
      ) as Promise<WorkspaceDiffBasePreference | undefined>;
    },
    openWorkspaceToolWindow(input: WorkspaceToolWindowOpenInput) {
      ipcRenderer.send(DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL, input);
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
    setWorkspaceDiffBase(input: WorkspaceDiffBasePreferenceInput) {
      return ipcRenderer.invoke(DESKTOP_WORKSPACE_DIFF_BASE_SET_CHANNEL, input);
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

function isUpdateStatus(value: unknown): value is DesktopUpdateStatus {
  if (typeof value !== "object" || value === null) return false;
  const status = value as { channel?: unknown; state?: unknown };
  return typeof status.channel === "string" && typeof status.state === "string";
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
