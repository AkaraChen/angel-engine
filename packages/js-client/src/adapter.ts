import type {
  Chat,
  ChatRuntimeConfig,
  ChatSendInput,
  ChatStreamEvent,
  Project,
} from "./types";

export interface AgentRunContext {
  chat: Chat;
  messages: readonly unknown[];
  project?: Project;
  signal: AbortSignal;
}

export interface AgentAdapter {
  id: string;
  inspectConfig?: (input: {
    cwd?: string;
    runtime?: string;
  }) => Promise<ChatRuntimeConfig> | ChatRuntimeConfig;
  run: (
    input: ChatSendInput,
    context: AgentRunContext,
  ) => AsyncIterable<ChatStreamEvent>;
}

export interface AgentRegistry {
  get: (runtime?: string) => AgentAdapter;
}

export function createAgentRegistry(
  adapters: AgentAdapter[],
  defaultRuntime = adapters[0]?.id,
): AgentRegistry {
  const byId = new Map(adapters.map((adapter) => [adapter.id, adapter]));
  return {
    get(runtime) {
      const adapter = byId.get(runtime ?? "") ?? byId.get(defaultRuntime ?? "");
      if (!adapter) {
        throw new Error(
          `No agent adapter registered for runtime "${runtime}".`,
        );
      }
      return adapter;
    },
  };
}
