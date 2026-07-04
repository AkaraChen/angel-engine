import type { Chat } from "@shared/chat";
import type { DesktopOpenChatFromNotificationEvent } from "@shared/desktop-window";
import type {
  WorkspaceLastOpenedTarget,
  WorkspaceMode,
} from "@/app/workspace/workspace-ui-store";
import is from "@sindresorhus/is";

export function chatRoutePath(
  chat: Chat,
  { includeProject = true }: { includeProject?: boolean } = {},
) {
  if (includeProject && is.nonEmptyString(chat.projectId)) {
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

export function isChatOpenableInWorkspaceMode(
  chat: Chat,
  workspaceMode: WorkspaceMode,
) {
  const isProjectChat = is.nonEmptyString(chat.projectId);
  return workspaceMode === "work" ? isProjectChat : !isProjectChat;
}

export function lastOpenedTargetPath({
  chats,
  target,
  workspaceMode,
}: {
  chats: Chat[];
  target?: WorkspaceLastOpenedTarget;
  workspaceMode: WorkspaceMode;
}) {
  if (target === undefined) return undefined;
  if (target.type === "draft") {
    if (workspaceMode === "chat" || target.projectId === undefined) return "/";
    return projectDraftRoutePath(target.projectId);
  }

  const chat = chats.find((item) => item.id === target.chatId);
  if (!chat || chat.archived) return undefined;

  return isChatOpenableInWorkspaceMode(chat, workspaceMode)
    ? chatRoutePath(chat, { includeProject: workspaceMode === "work" })
    : undefined;
}

export function chatNotificationRoutePath(
  event: DesktopOpenChatFromNotificationEvent,
) {
  if (is.nonEmptyString(event.projectId)) {
    return projectChatRoutePath(event.projectId, event.chatId);
  }
  return chatRoutePathId(event.chatId);
}

export function currentHashRoutePath() {
  const path = window.location.hash.replace(/^#/, "");
  return path || "/";
}
