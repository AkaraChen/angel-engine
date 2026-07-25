import type {
  ChatAttention,
  ChatAttentionListResult,
} from "@angel-engine/daemon-api/chat";

export class ChatAttentionStore {
  readonly #attentions = new Map<string, ChatAttention>();
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  list(): ChatAttentionListResult {
    return {
      attentions: [...this.#attentions.values()].map((attention) => ({
        ...attention,
      })),
    };
  }

  needsInput(chatId: string, runId: string, elicitationId: string): boolean {
    return this.#set({
      chatId,
      id: inputAttentionId(runId, elicitationId),
      status: "needsInput",
      updatedAt: this.#now(),
    });
  }

  completed(chatId: string, runId: string): boolean {
    return this.#set({
      chatId,
      id: completedAttentionId(runId),
      status: "completed",
      updatedAt: this.#now(),
    });
  }

  resolveInput(chatId: string, runId: string, elicitationId: string): boolean {
    return this.#clear(chatId, inputAttentionId(runId, elicitationId));
  }

  acknowledge(chatId: string, attentionId: string): boolean {
    const current = this.#attentions.get(chatId);
    if (current?.status !== "completed" || current.id !== attentionId) {
      return false;
    }
    this.#attentions.delete(chatId);
    return true;
  }

  clearChat(chatId: string): boolean {
    return this.#attentions.delete(chatId);
  }

  #clear(chatId: string, attentionId: string): boolean {
    const current = this.#attentions.get(chatId);
    if (current?.id !== attentionId) return false;
    this.#attentions.delete(chatId);
    return true;
  }

  #set(attention: ChatAttention): boolean {
    const current = this.#attentions.get(attention.chatId);
    if (current?.id === attention.id && current.status === attention.status) {
      return false;
    }
    this.#attentions.set(attention.chatId, attention);
    return true;
  }
}

function inputAttentionId(runId: string, elicitationId: string): string {
  return `${runId}:input:${elicitationId}`;
}

function completedAttentionId(runId: string): string {
  return `${runId}:completed`;
}
