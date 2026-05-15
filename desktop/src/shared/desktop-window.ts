export type DesktopOpenChatFromNotificationEvent = {
  chatId: string;
  projectId?: string | null;
};

export type DesktopThemeMode = "light" | "dark" | "system";

export type DesktopWindowCommand =
  | "new-chat"
  | "open-settings"
  | "toggle-sidebar";

export type DesktopThemeSetInput = {
  mode: DesktopThemeMode;
};

export const DESKTOP_ACTIVE_CHAT_SET_CHANNEL = "desktop-window:active-chat:set";
export const DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL =
  "desktop-window:confirm-delete-all-chats";
export const DESKTOP_COMMAND_CHANNEL = "desktop-window:command";
export const DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL =
  "desktop-window:notification:open-chat";
export const DESKTOP_THEME_SET_CHANNEL = "desktop-window:theme:set";
