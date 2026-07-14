export interface DesktopOpenChatFromNotificationEvent {
  chatId: string;
  projectId?: string | null;
}

export type DesktopThemeMode = "light" | "dark" | "system";

export type DesktopWindowCommand =
  | "new-chat"
  | "open-settings"
  | "toggle-sidebar";

export interface DesktopThemeSetInput {
  mode: DesktopThemeMode;
}

export interface DesktopConfirmDeleteCustomAgentInput {
  chatCount: number;
  label: string;
}

export interface DesktopConfirmDeleteArchivedChatsInput {
  chatCount: number;
  managedWorktreeCount: number;
}

export interface DesktopConfirmSaveWorkspaceFileChangesInput {
  path: string;
}

export type DesktopConfirmSaveWorkspaceFileChangesResult =
  | "cancel"
  | "discard"
  | "save";

export interface DesktopUpdateDownloadedEvent {
  releaseName: string;
  releaseNotes?: string;
}

export const DESKTOP_ACTIVE_CHAT_SET_CHANNEL = "desktop-window:active-chat:set";
export const DESKTOP_CONFIRM_DELETE_CUSTOM_AGENT_CHANNEL =
  "desktop-window:confirm-delete-custom-agent";
export const DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL =
  "desktop-window:confirm-delete-all-chats";
export const DESKTOP_CONFIRM_DELETE_ARCHIVED_CHATS_CHANNEL =
  "desktop-window:confirm-delete-archived-chats";
export const DESKTOP_CONFIRM_SAVE_WORKSPACE_FILE_CHANGES_CHANNEL =
  "desktop-window:confirm-save-workspace-file-changes";
export const DESKTOP_COMMAND_CHANNEL = "desktop-window:command";
export const DESKTOP_INSTALL_UPDATE_CHANNEL = "desktop-window:update:install";
export const DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL =
  "desktop-window:notification:open-chat";
export const DESKTOP_SETTINGS_OPEN_CHANNEL = "desktop-window:settings:open";
export const DESKTOP_THEME_SET_CHANNEL = "desktop-window:theme:set";
export const DESKTOP_UPDATE_DOWNLOADED_CHANNEL =
  "desktop-window:update:downloaded";
export const DESKTOP_WINDOW_CLOSE_CURRENT_CHANNEL =
  "desktop-window:close-current";
export const DESKTOP_WORKSPACE_TOOL_CONTEXT_SET_CHANNEL =
  "desktop-window:workspace-tool-context:set";
export const DESKTOP_WORKSPACE_TOOL_SURFACE_CHANGED_CHANNEL =
  "desktop-window:workspace-tool-surface:changed";
export const DESKTOP_WORKSPACE_TOOL_SURFACE_CONTEXT_SET_CHANNEL =
  "desktop-window:workspace-tool-surface-context:set";
export const DESKTOP_WORKSPACE_TOOL_SURFACE_FOCUS_CHANNEL =
  "desktop-window:workspace-tool-surface:focus";
export const DESKTOP_WORKSPACE_TOOL_SURFACE_GET_CHANNEL =
  "desktop-window:workspace-tool-surface:get";
export const DESKTOP_WORKSPACE_TOOL_SURFACE_HOST_SET_CHANNEL =
  "desktop-window:workspace-tool-surface-host:set";
export const DESKTOP_WORKSPACE_TOOL_SURFACE_SNAPSHOT_SET_CHANNEL =
  "desktop-window:workspace-tool-surface-snapshot:set";
export const DESKTOP_WORKSPACE_TOOL_INSTANCE_CLOSE_CHANNEL =
  "desktop-window:workspace-tool-instance:close";
export const DESKTOP_WORKSPACE_TOOL_INSTANCE_REGISTER_CHANNEL =
  "desktop-window:workspace-tool-instance:register";
export const DESKTOP_WORKSPACE_TOOL_INSTANCE_UPDATED_CHANNEL =
  "desktop-window:workspace-tool-instance:updated";
export const DESKTOP_WORKSPACE_TOOL_WINDOW_GET_CHANNEL =
  "desktop-window:workspace-tool-window:get";
export const DESKTOP_WORKSPACE_TOOL_WINDOW_OPEN_CHANNEL =
  "desktop-window:workspace-tool-window:open";
export const DESKTOP_WORKSPACE_TOOL_WINDOW_CLOSED_CHANNEL =
  "desktop-window:workspace-tool-window:closed";
