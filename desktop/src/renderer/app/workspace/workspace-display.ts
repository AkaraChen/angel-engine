import type { Chat } from "@angel-engine/daemon-api/chat";
import is from "@sindresorhus/is";

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function getWorkspaceTitle({
  selectedChat,
  selectedProjectName,
  t,
}: {
  selectedChat?: Chat;
  selectedProjectName?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (selectedChat) return displayChatTitle(selectedChat.title, t);
  if (is.nonEmptyString(selectedProjectName)) {
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

/**
 * Default chat titles are stored as the English sentinel `"New chat"` (or empty
 * for unnamed). Localize at display time so every surface stays consistent.
 */
export function displayChatTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed === "New chat") {
    return t("workspace.newChat");
  }
  return title;
}
