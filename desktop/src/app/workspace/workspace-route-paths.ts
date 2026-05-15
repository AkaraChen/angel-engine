import type { Chat } from "@/shared/chat";
import type { DesktopOpenChatFromNotificationEvent } from "@/shared/desktop-window";

export function chatRoutePath(chat: Chat) {
  if (chat.projectId) {
    return projectChatRoutePath(chat.projectId, chat.id);
  }
  return chatRoutePathId(chat.id);
}

export function chatRoutePathId(chatId: string) {
  return `/chat/${encodeURIComponent(chatId)}`;
}

export function projectChatRoutePath(projectId: string, chatId: string) {
  return `/project/${encodeURIComponent(projectId)}/${encodeURIComponent(chatId)}`;
}

export function projectDraftRoutePath(projectId: string) {
  return `/project/${encodeURIComponent(projectId)}`;
}

export function chatNotificationRoutePath(
  event: DesktopOpenChatFromNotificationEvent,
) {
  if (event.projectId) {
    return projectChatRoutePath(event.projectId, event.chatId);
  }
  return chatRoutePathId(event.chatId);
}

export function currentHashRoutePath() {
  const path = window.location.hash.replace(/^#/, "");
  return path || "/";
}
