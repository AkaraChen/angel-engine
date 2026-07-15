import type { AgentRuntime } from "@angel-engine/daemon-api/agents";

export function chatRuntimeProviderKey(
  chatId: string,
  runtime: AgentRuntime,
  suffix?: string,
): string {
  const key = `chat:${chatId}:${runtime}`;
  return suffix !== undefined && suffix.length > 0 ? `${key}:${suffix}` : key;
}

export function workspaceRuntimePageKey({
  chatRuntime,
  draftSessionId,
  draftProjectId,
  selectedChatId,
}: {
  chatRuntime?: AgentRuntime;
  draftSessionId?: number;
  draftProjectId?: string;
  selectedChatId?: string;
}): string {
  if (selectedChatId !== undefined) {
    return `chat:${selectedChatId}:${chatRuntime ?? "pending"}`;
  }

  const key =
    draftProjectId !== undefined ? `draft:project:${draftProjectId}` : "draft";
  return draftSessionId !== undefined && draftSessionId > 0
    ? `${key}:session:${draftSessionId}`
    : key;
}

export function draftRuntimeKeyFromProjectId(projectId: string | undefined) {
  return projectId !== undefined ? `project:${projectId}` : "create";
}

export function draftAgentConfigKey(
  runtimePageKey: string,
  runtime: AgentRuntime,
): string {
  return `${runtimePageKey}:${runtime}`;
}
