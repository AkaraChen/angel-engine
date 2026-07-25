import type {
  ChatAttention,
  ChatAttentionListResult,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";

interface StoredAttention {
  attention: ChatAttention;
  elicitationId?: string;
  runId: string;
}

/**
 * Process-local projection of run attention.
 *
 * Active-run state remains authoritative for execution; this store only keeps
 * the user-facing tombstone after a run leaves the registry.
 */
export class ChatAttentionStore {
  readonly #attentions = new Map<string, StoredAttention>();
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  list(): ChatAttentionListResult {
    return {
      attentions: [...this.#attentions.values()].map(({ attention }) => ({
        ...attention,
      })),
    };
  }

  apply(chatId: string, runId: string, event: ChatStreamEvent): boolean {
    if (event.type === "result") return this.#completed(chatId, runId);
    if (event.type === "error" || event.type === "done") {
      return this.#clearPendingRun(chatId, runId);
    }
    if (event.type !== "elicitation") return false;
    return event.elicitation.phase === "open"
      ? this.#needsInput(chatId, runId, event.elicitation.id)
      : this.resolveInput(chatId, runId, event.elicitation.id);
  }

  resolveInput(chatId: string, runId: string, elicitationId: string): boolean {
    const current = this.#attentions.get(chatId);
    if (
      current?.attention.status !== "needsInput" ||
      current.runId !== runId ||
      current.elicitationId !== elicitationId
    ) {
      return false;
    }
    this.#attentions.delete(chatId);
    return true;
  }

  acknowledge(chatId: string, attentionId: string): boolean {
    const current = this.#attentions.get(chatId);
    if (
      current?.attention.status !== "completed" ||
      current.attention.id !== attentionId
    ) {
      return false;
    }
    this.#attentions.delete(chatId);
    return true;
  }

  clearChat(chatId: string): boolean {
    return this.#attentions.delete(chatId);
  }

  #needsInput(chatId: string, runId: string, elicitationId: string): boolean {
    return this.#set({
      attention: {
        chatId,
        id: `${runId}:input:${elicitationId}`,
        status: "needsInput",
        updatedAt: this.#now(),
      },
      elicitationId,
      runId,
    });
  }

  #completed(chatId: string, runId: string): boolean {
    const current = this.#attentions.get(chatId);
    if (current?.attention.status === "needsInput") return false;
    return this.#set({
      attention: {
        chatId,
        id: `${runId}:completed`,
        status: "completed",
        updatedAt: this.#now(),
      },
      runId,
    });
  }

  #clearPendingRun(chatId: string, runId: string): boolean {
    const current = this.#attentions.get(chatId);
    if (current?.attention.status !== "needsInput" || current.runId !== runId) {
      return false;
    }
    this.#attentions.delete(chatId);
    return true;
  }

  #set(next: StoredAttention): boolean {
    const current = this.#attentions.get(next.attention.chatId);
    if (
      current?.attention.id === next.attention.id &&
      current.attention.status === next.attention.status
    ) {
      return false;
    }
    this.#attentions.set(next.attention.chatId, next);
    return true;
  }
}
