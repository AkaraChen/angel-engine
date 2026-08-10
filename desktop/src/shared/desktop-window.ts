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

/**
 * Update notices the main process needs the user to see. The renderer owns the
 * presentation (an in-app dialog), so main sends the already-translated copy
 * plus the actions the dialog should offer.
 */
export interface DesktopUpdateMessageEvent {
  actions: DesktopUpdateMessageAction[];
  detail: string;
  message: string;
  tone: "error" | "info";
}

export type DesktopUpdateMessageAction = "install";

export interface DesktopUpdateDownloadedEvent {
  releaseName: string;
  releaseNotes?: string;
}

export const DESKTOP_ACTIVE_CHAT_SET_CHANNEL = "desktop-window:active-chat:set";
export const DESKTOP_UPDATE_CHANNEL_SET_CHANNEL =
  "desktop-window:update:channel:set";
export const DESKTOP_UPDATE_CHECK_CHANNEL = "desktop-window:update:check";
export const DESKTOP_UPDATE_STATUS_CHANGED_CHANNEL =
  "desktop-window:update:status:changed";
export const DESKTOP_UPDATE_STATUS_GET_CHANNEL =
  "desktop-window:update:status:get";
export const DESKTOP_UPDATE_MESSAGE_CHANNEL = "desktop-window:update:message";
export const DESKTOP_COMMAND_CHANNEL = "desktop-window:command";
export const DESKTOP_WINDOW_CONTENT_READY_CHANNEL =
  "desktop-window:content-ready";
export const DESKTOP_INSTALL_UPDATE_CHANNEL = "desktop-window:update:install";
export const DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL =
  "desktop-window:notification:open-chat";
export const DESKTOP_NOTIFICATION_HISTORY_CHANGED_CHANNEL =
  "desktop-window:notification:history-changed";
export const DESKTOP_NOTIFICATION_HISTORY_CLEAR_CHANNEL =
  "desktop-window:notification:history:clear";
export const DESKTOP_NOTIFICATION_HISTORY_GET_CHANNEL =
  "desktop-window:notification:history:get";
export const DESKTOP_NOTIFICATION_HISTORY_MARK_READ_CHANNEL =
  "desktop-window:notification:history:mark-read";
export const DESKTOP_NOTIFICATION_PREFERENCES_GET_CHANNEL =
  "desktop-window:notification:preferences:get";
export const DESKTOP_NOTIFICATION_PREFERENCES_SET_CHANNEL =
  "desktop-window:notification:preferences:set";
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
