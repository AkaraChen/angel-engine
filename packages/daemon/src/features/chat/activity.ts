import type {
  ChatActivity,
  ChatActivityListResult,
  ChatAttentionListResult,
  ChatElicitation,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type { ProcessRegistryEntry } from "@angel-engine/daemon-api/daemon";

const DEFAULT_STUCK_GRACE_MS = 3_000;
const MAX_FAILURE_MESSAGE_LENGTH = 240;

interface StoredActivity {
  activity: ChatActivity;
  hadRootPid: boolean;
  inputId?: string;
  pendingSuccess: boolean;
  processLossMatured: boolean;
  stuckTimer?: ReturnType<typeof setTimeout>;
}

interface ChatActivityStoreOptions {
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  now?: () => string;
  onChange?: (chatId: string) => void;
  setTimer?: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  stuckGraceMs?: number;
}

/**
 * The daemon's process-local Fleet projection.
 *
 * It stores one current run per chat. Legacy attention is derived from this
 * map so transports cannot disagree about user-visible run state.
 */
export class ChatActivityStore {
  readonly #activities = new Map<string, StoredActivity>();
  readonly #clearTimer: NonNullable<ChatActivityStoreOptions["clearTimer"]>;
  readonly #now: NonNullable<ChatActivityStoreOptions["now"]>;
  readonly #onChange: NonNullable<ChatActivityStoreOptions["onChange"]>;
  readonly #rootPids = new Map<string, number>();
  readonly #setTimer: NonNullable<ChatActivityStoreOptions["setTimer"]>;
  readonly #stuckGraceMs: number;

  constructor(options: ChatActivityStoreOptions = {}) {
    this.#clearTimer = options.clearTimer ?? clearTimeout;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#onChange = options.onChange ?? (() => undefined);
    this.#setTimer = options.setTimer ?? setTimeout;
    this.#stuckGraceMs = options.stuckGraceMs ?? DEFAULT_STUCK_GRACE_MS;
  }

  list(): ChatActivityListResult {
    return {
      items: [...this.#activities.values()].map(({ activity }) =>
        structuredClone(activity),
      ),
    };
  }

  attentionList(): ChatAttentionListResult {
    const attentions = [];
    for (const { activity } of this.#activities.values()) {
      if (activity.status !== "waiting_for_you" && activity.status !== "done") {
        continue;
      }
      attentions.push({
        chatId: activity.chatId,
        id: activity.attentionId,
        status:
          activity.status === "waiting_for_you" ? "needsInput" : "completed",
        updatedAt: activity.updatedAt,
      } as const);
    }
    return { attentions };
  }

  hasRun(chatId: string, runId: string): boolean {
    return this.#current(chatId, runId) !== undefined;
  }

  start(chatId: string, runId: string): boolean {
    const current = this.#activities.get(chatId);
    if (current?.activity.runId === runId) return false;
    if (current) this.#cancelStuckTimer(current);

    const next: StoredActivity = {
      activity: this.#running(chatId, runId),
      hadRootPid: this.#rootPids.has(chatId),
      pendingSuccess: false,
      processLossMatured: false,
    };
    this.#activities.set(chatId, next);
    this.#onChange(chatId);
    return true;
  }

  apply(chatId: string, runId: string, event: ChatStreamEvent): boolean {
    const current = this.#current(chatId, runId);
    if (!current) return false;

    switch (event.type) {
      case "result":
        if (current.activity.status === "waiting_for_you") {
          current.pendingSuccess = true;
          return false;
        }
        return this.#terminal(current, {
          attentionId: `${runId}:done`,
          chatId,
          runId,
          status: "done",
          updatedAt: this.#now(),
        });
      case "error":
        return this.#terminal(current, {
          attentionId: `${runId}:failed`,
          chatId,
          failure: { message: conciseFailure(event.message) },
          reason: "runtime_error",
          runId,
          status: "failed",
          updatedAt: this.#now(),
        });
      case "elicitation":
        return event.elicitation.phase === "open"
          ? this.#waiting(
              current,
              event.elicitation.id,
              elicitationReason(event.elicitation),
            )
          : this.resolveInput(chatId, runId, event.elicitation.id);
      case "tool":
      case "toolDelta": {
        const inputId = event.action.elicitationId ?? event.action.id;
        return event.action.phase === "awaitingDecision"
          ? this.#waiting(current, inputId, "approval")
          : this.resolveInput(chatId, runId, inputId);
      }
      case "chat":
      case "delta":
      case "done":
      case "plan":
        return false;
    }
  }

  resolveInput(chatId: string, runId: string, inputId: string): boolean {
    const current = this.#current(chatId, runId);
    if (
      current?.activity.status !== "waiting_for_you" ||
      current.inputId !== inputId
    ) {
      return false;
    }
    current.inputId = undefined;
    if (current.pendingSuccess) {
      return this.#terminal(current, {
        attentionId: `${runId}:done`,
        chatId,
        runId,
        status: "done",
        updatedAt: this.#now(),
      });
    }
    return this.#set(
      current,
      current.processLossMatured
        ? {
            chatId,
            reason: "process_exited",
            runId,
            status: "stuck",
            updatedAt: this.#now(),
          }
        : this.#running(chatId, runId),
    );
  }

  acknowledge(chatId: string, attentionId: string): boolean {
    const current = this.#activities.get(chatId);
    if (
      (current?.activity.status !== "done" &&
        current?.activity.status !== "failed") ||
      current.activity.attentionId !== attentionId
    ) {
      return false;
    }
    this.#delete(chatId, current);
    return true;
  }

  cancel(chatId: string, runId: string): boolean {
    const current = this.#current(chatId, runId);
    if (!current) return false;
    this.#delete(chatId, current);
    return true;
  }

  clearChat(chatId: string): boolean {
    const current = this.#activities.get(chatId);
    if (!current) return false;
    this.#delete(chatId, current);
    return true;
  }

  replaceProcessEntries(entries: readonly ProcessRegistryEntry[]): void {
    const nextRootPids = new Map(
      entries.map((entry) => [entry.id, entry.rootPid]),
    );
    const chatIds = new Set([...this.#rootPids.keys(), ...nextRootPids.keys()]);
    this.#rootPids.clear();
    for (const [chatId, rootPid] of nextRootPids) {
      this.#rootPids.set(chatId, rootPid);
    }

    for (const chatId of chatIds) {
      const current = this.#activities.get(chatId);
      if (!current) continue;
      if (nextRootPids.has(chatId)) {
        current.hadRootPid = true;
        current.processLossMatured = false;
        this.#cancelStuckTimer(current);
        if (current.activity.status === "stuck") {
          this.#set(current, this.#running(chatId, current.activity.runId));
        }
      } else if (current.hadRootPid) {
        this.#scheduleStuck(chatId, current);
      }
    }
  }

  #current(chatId: string, runId: string): StoredActivity | undefined {
    const current = this.#activities.get(chatId);
    return current?.activity.runId === runId ? current : undefined;
  }

  #delete(chatId: string, current: StoredActivity): void {
    this.#cancelStuckTimer(current);
    this.#activities.delete(chatId);
    this.#onChange(chatId);
  }

  #running(chatId: string, runId: string): ChatActivity {
    return { chatId, runId, status: "running", updatedAt: this.#now() };
  }

  #waiting(
    current: StoredActivity,
    inputId: string,
    reason: "approval" | "question",
  ): boolean {
    if (
      current.activity.status === "done" ||
      current.activity.status === "failed"
    ) {
      return false;
    }
    current.inputId = inputId;
    return this.#set(current, {
      attentionId: `${current.activity.runId}:input:${inputId}`,
      chatId: current.activity.chatId,
      reason,
      runId: current.activity.runId,
      status: "waiting_for_you",
      updatedAt: this.#now(),
    });
  }

  #terminal(current: StoredActivity, activity: ChatActivity): boolean {
    if (
      current.activity.status === "done" ||
      current.activity.status === "failed"
    ) {
      return false;
    }
    current.inputId = undefined;
    current.pendingSuccess = false;
    this.#cancelStuckTimer(current);
    return this.#set(current, activity);
  }

  #set(current: StoredActivity, activity: ChatActivity): boolean {
    if (sameActivity(current.activity, activity)) return false;
    current.activity = activity;
    this.#onChange(activity.chatId);
    return true;
  }

  #scheduleStuck(chatId: string, current: StoredActivity): void {
    if (
      current.stuckTimer !== undefined ||
      current.activity.status === "done" ||
      current.activity.status === "failed"
    ) {
      return;
    }
    const runId = current.activity.runId;
    current.stuckTimer = this.#setTimer(() => {
      current.stuckTimer = undefined;
      if (
        this.#current(chatId, runId) !== current ||
        this.#rootPids.has(chatId)
      ) {
        return;
      }
      current.processLossMatured = true;
      if (current.activity.status === "running") {
        this.#set(current, {
          chatId,
          reason: "process_exited",
          runId,
          status: "stuck",
          updatedAt: this.#now(),
        });
      }
    }, this.#stuckGraceMs);
  }

  #cancelStuckTimer(current: StoredActivity): void {
    if (current.stuckTimer === undefined) return;
    this.#clearTimer(current.stuckTimer);
    current.stuckTimer = undefined;
  }
}

function elicitationReason(
  elicitation: ChatElicitation,
): "approval" | "question" {
  return elicitation.kind === "approval" ||
    elicitation.kind === "permissionProfile"
    ? "approval"
    : "question";
}

function conciseFailure(message: string): string {
  const firstLine = message.trim().split(/\r?\n/, 1)[0] || "Runtime failed.";
  return firstLine.length <= MAX_FAILURE_MESSAGE_LENGTH
    ? firstLine
    : `${firstLine.slice(0, MAX_FAILURE_MESSAGE_LENGTH - 1)}…`;
}

function sameActivity(left: ChatActivity, right: ChatActivity): boolean {
  return (
    left.chatId === right.chatId &&
    left.runId === right.runId &&
    left.status === right.status &&
    ("attentionId" in left ? left.attentionId : undefined) ===
      ("attentionId" in right ? right.attentionId : undefined) &&
    ("reason" in left ? left.reason : undefined) ===
      ("reason" in right ? right.reason : undefined) &&
    ("failure" in left ? left.failure.message : undefined) ===
      ("failure" in right ? right.failure.message : undefined)
  );
}
