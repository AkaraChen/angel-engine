export type DesktopOpenChatFromNotificationEvent = {
  chatId: string;
  projectId?: string | null;
};

export const DESKTOP_ACTIVE_CHAT_SET_CHANNEL = "desktop-window:active-chat:set";
export const DESKTOP_OPEN_CHAT_FROM_NOTIFICATION_CHANNEL =
  "desktop-window:notification:open-chat";
