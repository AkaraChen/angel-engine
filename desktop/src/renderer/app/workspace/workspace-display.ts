import type { Chat } from "@shared/chat";

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function getWorkspaceTitle({
  selectedChat,
  selectedProjectName,
  settingsActive,
  t,
}: {
  selectedChat?: Chat;
  selectedProjectName?: string;
  settingsActive: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (settingsActive) return t("workspace.settings");
  if (selectedChat) return displayChatTitle(selectedChat.title, t);
  if (selectedProjectName) {
    return t("workspace.newChatInProject", {
      projectName: selectedProjectName,
    });
  }
  return t("workspace.newChat");
}

export function getProjectDisplayName(projectPath: string) {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

export function displayChatTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return title === "New chat" ? t("workspace.newChat") : title;
}
