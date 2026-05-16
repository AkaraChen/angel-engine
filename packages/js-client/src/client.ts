import type { AgentAdapter, AgentRegistry } from "./adapter.js";
import { createAgentRegistry } from "./adapter.js";
import { InMemoryAngelStore, type AngelStore } from "./store.js";
import type {
  AngelClientEvent,
  Chat,
  ChatCreateInput,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
  ChatLoadResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSendResult,
  ChatStreamEvent,
  CreateProjectInput,
  Project,
} from "./types.js";
import { createId, nowIso } from "./utils/core.js";
import { appendChatTextPart } from "./utils/messages.js";
import { chatToolActionToPart } from "./utils/tools.js";

export interface AngelClientOptions {
  adapters: AgentAdapter[] | AgentRegistry;
  defaultRuntime?: string;
  store?: AngelStore;
}

export type AngelClientListener = (event: AngelClientEvent) => void;

export class AngelClient {
  readonly agents: AgentRegistry;
  readonly store: AngelStore;
  #listeners = new Set<AngelClientListener>();

  constructor(options: AngelClientOptions) {
    this.store = options.store ?? new InMemoryAngelStore();
    this.agents = Array.isArray(options.adapters)
      ? createAgentRegistry(options.adapters, options.defaultRuntime)
      : options.adapters;
  }

  subscribe(listener: AngelClientListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  readonly projects = {
    create: async (input: CreateProjectInput): Promise<Project> => {
      const project = {
        id: input.id ?? createId("project"),
        path: input.path,
      };
      return this.store.createProject(project);
    },
    list: async (): Promise<Project[]> => this.store.listProjects(),
  };

  readonly chats = {
    archive: async (chatId: string): Promise<Chat> => {
      const chat = await this.store.archiveChat(chatId);
      this.emit({ chat, type: "chat.updated" });
      return chat;
    },
    create: async (input: ChatCreateInput = {}): Promise<Chat> =>
      this.createChat(input),
    deleteAll: async (): Promise<{ deleted: true }> => {
      await this.store.deleteAllChats();
      return { deleted: true };
    },
    inspectConfig: async (
      input: ChatRuntimeConfigInput = {},
    ): Promise<ChatRuntimeConfig> => {
      const adapter = this.agents.get(input.runtime);
      return adapter.inspectConfig?.(input) ?? defaultRuntimeConfig(adapter.id);
    },
    list: async (): Promise<Chat[]> => this.store.listChats(),
    load: async (chatId: string): Promise<ChatLoadResult> => {
      const chat = await this.requireChat(chatId);
      const messages = await this.store.getMessages(chatId);
      const config = await this.chats.inspectConfig({ runtime: chat.runtime });
      return { chat, config, messages };
    },
    rename: async (input: { chatId: string; title: string }): Promise<Chat> => {
      const chat = await this.requireChat(input.chatId);
      const updated = await this.touchChat({ ...chat, title: input.title });
      this.emit({ chat: updated, type: "chat.updated" });
      return updated;
    },
    send: async (
      input: ChatSendInput,
      onEvent?: (event: ChatStreamEvent) => void,
    ): Promise<ChatSendResult> => {
      let result: ChatSendResult | undefined;
      for await (const event of this.stream(input)) {
        onEvent?.(event);
        if (event.type === "result") result = event.result;
      }
      if (!result) throw new Error("Agent run completed without a result.");
      return result;
    },
    setRuntime: async (input: {
      chatId: string;
      runtime: string;
    }): Promise<Chat> => {
      const chat = await this.requireChat(input.chatId);
      const updated = await this.touchChat({ ...chat, runtime: input.runtime });
      this.emit({ chat: updated, type: "chat.updated" });
      return updated;
    },
    stream: (input: ChatSendInput): AsyncIterable<ChatStreamEvent> =>
      this.stream(input),
  };

  private async createChat(input: ChatCreateInput = {}): Promise<Chat> {
    const project = input.projectId
      ? await this.store.getProject(input.projectId)
      : undefined;
    const createdAt = nowIso();
    const chat: Chat = {
      archived: false,
      createdAt,
      cwd: project?.path ?? null,
      id: createId("chat"),
      projectId: input.projectId ?? null,
      remoteThreadId: null,
      runtime: input.runtime ?? this.agents.get(input.runtime).id,
      title: input.title ?? "Untitled chat",
      updatedAt: createdAt,
    };
    await this.store.createChat(chat);
    this.emit({ chat, type: "chat.created" });
    return chat;
  }

  private emit(event: AngelClientEvent): void {
    for (const listener of this.#listeners) listener(event);
  }

  private async requireChat(chatId: string): Promise<Chat> {
    const chat = await this.store.getChat(chatId);
    if (!chat) throw new Error(`Chat "${chatId}" was not found.`);
    return chat;
  }

  private async *stream(input: ChatSendInput): AsyncIterable<ChatStreamEvent> {
    const controller = new AbortController();
    let chat = input.chatId
      ? await this.requireChat(input.chatId)
      : await this.createChat({
          projectId: input.projectId,
          runtime: input.runtime,
          title: input.text.slice(0, 60) || undefined,
        });
    const adapter = this.agents.get(input.runtime ?? chat.runtime);
    if (chat.runtime !== adapter.id) {
      chat = await this.touchChat({ ...chat, runtime: adapter.id });
    }

    const userMessage = await this.appendMessage(chat.id, {
      content: [{ text: input.text, type: "text" }],
      createdAt: nowIso(),
      id: createId("message"),
      role: "user",
    });
    this.emit({
      chatId: chat.id,
      message: userMessage,
      type: "message.appended",
    });

    const assistantParts: ChatHistoryMessagePart[] = [];
    const turnId = createId("turn");
    const project = chat.projectId
      ? await this.store.getProject(chat.projectId)
      : undefined;
    const context = {
      chat,
      messages: await this.store.getMessages(chat.id),
      project,
      signal: controller.signal,
    };

    try {
      yield* this.forwardEvent(chat.id, { chat, type: "chat" });
      for await (const event of adapter.run(input, context)) {
        if (event.type === "delta") {
          appendChatTextPart(assistantParts, event.part, event.text);
        } else if (event.type === "plan") {
          assistantParts.push({
            data: event.plan,
            name: event.plan.kind === "todo" ? "todo" : "plan",
            type: "data",
          });
        } else if (event.type === "tool" || event.type === "toolDelta") {
          upsertToolPart(assistantParts, chatToolActionToPart(event.action));
        } else if (event.type === "elicitation") {
          assistantParts.push({
            data: event.elicitation,
            name: "elicitation",
            type: "data",
          });
        }

        yield* this.forwardEvent(chat.id, event);
      }

      const text = assistantParts.reduce(
        (current, part) =>
          part.type === "text" ? current + part.text : current,
        "",
      );
      const reasoning = assistantParts.reduce(
        (current, part) =>
          part.type === "reasoning" ? current + part.text : current,
        "",
      );
      const config = await this.chats.inspectConfig({ runtime: chat.runtime });
      const result: ChatSendResult = {
        actions: collectToolActions(assistantParts),
        chat,
        chatId: chat.id,
        config,
        content: assistantParts,
        reasoning,
        text,
        turnId,
      };
      const assistantMessage = await this.appendMessage(chat.id, {
        content: assistantParts,
        createdAt: nowIso(),
        id: createId("message"),
        role: "assistant",
      });
      this.emit({
        chatId: chat.id,
        message: assistantMessage,
        type: "message.appended",
      });
      yield* this.forwardEvent(chat.id, { result, type: "result" });
      yield* this.forwardEvent(chat.id, { type: "done" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      yield* this.forwardEvent(chat.id, { message, type: "error" });
      throw error;
    }
  }

  private async appendMessage(
    chatId: string,
    message: ChatHistoryMessage,
  ): Promise<ChatHistoryMessage> {
    const appended = await this.store.appendMessage(chatId, message);
    const chat = await this.requireChat(chatId);
    await this.touchChat(chat);
    return appended;
  }

  private async touchChat(chat: Chat): Promise<Chat> {
    const updated = { ...chat, updatedAt: nowIso() };
    return this.store.updateChat(updated);
  }

  private async *forwardEvent(
    chatId: string,
    event: ChatStreamEvent,
  ): AsyncIterable<ChatStreamEvent> {
    this.emit({ chatId, event, type: "run.event" });
    yield event;
  }
}

function defaultRuntimeConfig(runtime: string): ChatRuntimeConfig {
  return {
    agentState: {
      currentMode: "chat",
      currentPermissionMode: "ask",
    },
    availableCommands: [],
    canSetMode: true,
    canSetModel: true,
    canSetPermissionMode: true,
    canSetReasoningEffort: true,
    currentMode: "chat",
    currentModel: `${runtime}-mock`,
    currentPermissionMode: "ask",
    currentReasoningEffort: "medium",
    modes: [{ label: "Chat", value: "chat" }],
    models: [{ label: `${runtime} mock`, value: `${runtime}-mock` }],
    permissionModes: [{ label: "Ask", value: "ask" }],
    reasoningEfforts: [
      { label: "Low", value: "low" },
      { label: "Medium", value: "medium" },
      { label: "High", value: "high" },
    ],
  };
}

function upsertToolPart(
  parts: ChatHistoryMessagePart[],
  nextPart: Extract<ChatHistoryMessagePart, { type: "tool-call" }>,
): void {
  const index = parts.findIndex(
    (part) =>
      part.type === "tool-call" && part.toolCallId === nextPart.toolCallId,
  );
  if (index === -1) parts.push(nextPart);
  else parts[index] = nextPart;
}

function collectToolActions(parts: ChatHistoryMessagePart[]) {
  return parts
    .filter((part) => part.type === "tool-call")
    .map((part) => part.artifact);
}
