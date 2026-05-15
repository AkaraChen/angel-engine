import type { AgentRuntime } from "@shared/agents";

export function chatRuntimeProviderKey(
  chatId: string,
  runtime: AgentRuntime,
  suffix?: string,
): string {
  const key = `chat:${chatId}:${runtime}`;
  return suffix ? `${key}:${suffix}` : key;
}

export function workspaceRuntimePageKey({
  chatRuntime,
  draftProjectId,
  selectedChatId,
  settingsActive,
}: {
  chatRuntime?: AgentRuntime;
  draftProjectId?: string;
  selectedChatId?: string;
  settingsActive: boolean;
}): string {
  if (selectedChatId) {
    return `chat:${selectedChatId}:${chatRuntime ?? "pending"}`;
  }

  if (settingsActive) {
    return "settings";
  }

  return draftProjectId ? `draft:project:${draftProjectId}` : "draft";
}

export function draftRuntimeKeyFromProjectId(projectId: string | undefined) {
  return projectId ? `project:${projectId}` : "create";
}
