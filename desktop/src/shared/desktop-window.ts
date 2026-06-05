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
export const DESKTOP_COMMAND_CHANNEL = "desktop-window:command";
export const DESKTOP_INSTALL_UPDATE_CHANNEL = "desktop-window:update:install";
export const DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL =
  "desktop-window:notification:open-chat";
export const DESKTOP_SETTINGS_OPEN_CHANNEL = "desktop-window:settings:open";
export const DESKTOP_THEME_SET_CHANNEL = "desktop-window:theme:set";
export const DESKTOP_UPDATE_DOWNLOADED_CHANNEL =
  "desktop-window:update:downloaded";
