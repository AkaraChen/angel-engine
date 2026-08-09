import type {
  ChatActiveRunResult,
  ChatActiveRunSnapshot,
  ChatElicitationResponse,
  ChatOpenElicitation,
  ChatToolAction,
  ChatHistoryMessagePart,
  ChatRunObserverEvent,
  ChatRunStartInput,
  ChatSendResult,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type { ChatStreamControls } from "./runtime";

import {
  appendChatTextPart,
  chatToolActionToPart,
  cloneChatHistoryPart,
  imageDataUrl,
  normalizeChatAttachmentsInput,
  upsertChatElicitationPart,
  upsertChatPlanPart,
} from "@angel-engine/daemon-api/chat";
import { DaemonError } from "../../platform/errors";

export interface ChatRunObserver {
  close: () => void;
  write: (message: ChatRunObserverEvent) => Promise<void>;
}

export interface ChatRunEvent {
  chatId: string;
  event: ChatStreamEvent;
  runId: string;
  sequence: number;
}

interface ChatRunRegistryOptions {
  execute: (
    input: ChatRunStartInput,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal,
    controls: ChatStreamControls,
  ) => Promise<ChatSendResult>;
  isRunIdRetained?: (chatId: string, runId: string) => boolean;
  onEvent?: (event: ChatRunEvent) => void;
}

interface ObserverRecord {
  active: boolean;
  observer: ChatRunObserver;
  queue: Promise<void>;
}

interface ActiveRun {
  abortController: AbortController;
  input: ChatRunStartInput;
  observers: Set<ObserverRecord>;
  providerCompleted: boolean;
  started: boolean;
  resolveElicitation?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => Promise<void>;
  snapshot: ChatActiveRunSnapshot;
}

/**
 * Bounds replay protection for client-generated run ids. Active ids live in
 * the registry maps; recently retired ids prevent retries from colliding with
 * terminal markers without growing for the daemon's entire lifetime.
 */
export const CHAT_RUN_ID_RETENTION_LIMIT = 4_096;

/**
 * Process-local daemon-owned run state.
 *
 * It intentionally retains only a materialized snapshot, not an event journal.
 * Each observer gets that snapshot atomically before later events are queued.
 */
export class ChatRunRegistry {
  readonly #activeByChat = new Map<string, ActiveRun>();
  readonly #activeById = new Map<string, ActiveRun>();
  readonly #execute: ChatRunRegistryOptions["execute"];
  readonly #isRunIdRetained: NonNullable<
    ChatRunRegistryOptions["isRunIdRetained"]
  >;
  readonly #onEvent?: ChatRunRegistryOptions["onEvent"];
  readonly #retiredRunIds = new Set<string>();

  constructor(options: ChatRunRegistryOptions) {
    this.#execute = options.execute;
    this.#isRunIdRetained = options.isRunIdRetained ?? (() => false);
    this.#onEvent = options.onEvent;
  }

  start(runId: string, input: ChatRunStartInput): ChatActiveRunSnapshot {
    const snapshot = this.reserve(runId, input);
    this.begin(runId);
    return snapshot;
  }

  reserve(runId: string, input: ChatRunStartInput): ChatActiveRunSnapshot {
    if (runId.length === 0) {
      throw DaemonError.invalidRequest("runId is required.");
    }
    if (this.#activeById.has(runId)) {
      throw DaemonError.chatRunConflict("Run id is already active.");
    }
    if (this.#retiredRunIds.has(runId)) {
      throw DaemonError.chatRunConflict("Run id has already been used.");
    }
    if (this.#isRunIdRetained(input.chatId, runId)) {
      throw DaemonError.chatRunConflict("Run id has already been used.");
    }
    if (this.#activeByChat.has(input.chatId)) {
      throw DaemonError.chatRunConflict();
    }

    const normalizedInput: ChatRunStartInput = {
      attachments: normalizeChatAttachmentsInput(input.attachments),
      chatId: input.chatId,
      mode: input.mode,
      model: input.model,
      permissionMode: input.permissionMode,
      reasoningEffort: input.reasoningEffort,
      text: input.text,
    };
    const startedAt = new Date().toISOString();
    const run: ActiveRun = {
      abortController: new AbortController(),
      input: normalizedInput,
      observers: new Set(),
      providerCompleted: false,
      started: false,
      snapshot: {
        assistantMessage: {
          content: [],
          createdAt: startedAt,
          id: `${runId}:assistant`,
          role: "assistant",
        },
        chatId: input.chatId,
        lastEventSequence: 0,
        pendingElicitation: null,
        runId,
        startedAt,
        status: "running",
        updatedAt: startedAt,
        userMessage: {
          content: userMessageContent(normalizedInput),
          createdAt: startedAt,
          id: `${runId}:user`,
          role: "user",
        },
      },
    };
    this.#activeById.set(runId, run);
    this.#activeByChat.set(input.chatId, run);
    return cloneSnapshot(run.snapshot);
  }

  begin(runId: string): void {
    const run = this.#require(runId);
    if (run.started) return;
    run.started = true;
    void this.#run(run);
  }

  active(chatId: string): ChatActiveRunResult {
    const run = this.#activeByChat.get(chatId);
    return { run: run ? cloneSnapshot(run.snapshot) : null };
  }

  snapshot(runId: string): ChatActiveRunSnapshot {
    return cloneSnapshot(this.#require(runId).snapshot);
  }

  observe(runId: string, observer: ChatRunObserver): () => void {
    const run = this.#require(runId);
    const record: ObserverRecord = {
      active: true,
      observer,
      queue: Promise.resolve(),
    };
    run.observers.add(record);
    this.#enqueue(run, record, {
      snapshot: cloneSnapshot(run.snapshot),
      type: "snapshot",
    });
    return () => this.#detach(run, record);
  }

  stop(runId: string): void {
    const run = this.#require(runId);
    if (!run.started) {
      this.#remove(run);
      return;
    }
    if (run.providerCompleted) {
      this.#finish(run);
      return;
    }
    run.abortController.abort();
  }

  /** Permanently detaches a deleted chat so late provider events are ignored. */
  discardChat(chatId: string): void {
    const run = this.#activeByChat.get(chatId);
    if (!run) return;
    run.abortController.abort();
    this.#remove(run);
  }

  async resolveElicitation(
    runId: string,
    elicitationId: string,
    response: ChatElicitationResponse,
  ): Promise<void> {
    const run = this.#require(runId);
    const snapshot = run.snapshot;
    const handler = run.resolveElicitation;
    if (
      snapshot.status !== "needsInput" ||
      snapshot.pendingElicitation.id !== elicitationId ||
      handler === undefined
    ) {
      throw DaemonError.chatRunNotWaiting();
    }

    const pendingElicitation = snapshot.pendingElicitation;
    run.snapshot = {
      ...snapshot,
      pendingElicitation: null,
      status: "running",
      updatedAt: nextTimestamp(snapshot.updatedAt),
    };
    try {
      await handler(elicitationId, response);
    } catch (error) {
      if (this.#activeById.get(runId) === run) {
        if (run.providerCompleted) {
          this.#emit(run, { message: errorMessage(error), type: "error" });
          this.#finish(run);
        } else {
          run.snapshot = {
            ...run.snapshot,
            pendingElicitation,
            status: "needsInput",
            updatedAt: nextTimestamp(run.snapshot.updatedAt),
          };
        }
      }
      throw error;
    }
    if (run.providerCompleted) this.#finish(run);
  }

  async #run(run: ActiveRun): Promise<void> {
    try {
      const result = await this.#execute(
        run.input,
        (event) => this.#emit(run, event),
        run.abortController.signal,
        {
          setResolveElicitation: (handler) => {
            run.resolveElicitation = handler;
          },
        },
      );
      run.providerCompleted = true;
      if (
        run.snapshot.status === "needsInput" &&
        run.resolveElicitation === undefined
      ) {
        this.#emit(run, {
          message: "Runtime completed before pending input could be resolved.",
          type: "error",
        });
      } else {
        this.#emit(run, { result, type: "result" });
        if (run.snapshot.status === "needsInput") return;
      }
    } catch (error) {
      this.#emit(run, { message: errorMessage(error), type: "error" });
    }
    this.#finish(run);
  }

  #finish(run: ActiveRun): void {
    if (this.#activeById.get(run.snapshot.runId) !== run) return;
    this.#emit(run, { type: "done" });
    this.#remove(run);
  }

  #emit(run: ActiveRun, event: ChatStreamEvent): void {
    if (this.#activeById.get(run.snapshot.runId) !== run) return;
    const sequence = run.snapshot.lastEventSequence + 1;
    materialize(run, event, sequence);
    const message: ChatRunObserverEvent = {
      event: structuredClone(event),
      sequence,
      type: "event",
    };
    for (const observer of run.observers) {
      this.#enqueue(run, observer, message);
    }
    this.#onEvent?.({
      chatId: run.snapshot.chatId,
      event: structuredClone(event),
      runId: run.snapshot.runId,
      sequence,
    });
  }

  #enqueue(
    run: ActiveRun,
    record: ObserverRecord,
    message: ChatRunObserverEvent,
  ): void {
    if (!record.active) return;
    record.queue = record.queue
      .then(() => record.observer.write(structuredClone(message)))
      .catch(() => this.#detach(run, record));
  }

  #detach(run: ActiveRun, record: ObserverRecord): void {
    if (!record.active) return;
    record.active = false;
    run.observers.delete(record);
    record.observer.close();
  }

  #remove(run: ActiveRun): void {
    if (this.#activeById.get(run.snapshot.runId) !== run) return;
    this.#activeById.delete(run.snapshot.runId);
    if (this.#activeByChat.get(run.snapshot.chatId) === run) {
      this.#activeByChat.delete(run.snapshot.chatId);
    }
    this.#retainRunId(run.snapshot.runId);
    for (const observer of run.observers) {
      observer.queue.then(
        () => this.#detach(run, observer),
        () => this.#detach(run, observer),
      );
    }
  }

  #retainRunId(runId: string): void {
    this.#retiredRunIds.add(runId);
    if (this.#retiredRunIds.size <= CHAT_RUN_ID_RETENTION_LIMIT) return;
    const oldestRunId = this.#retiredRunIds.values().next().value;
    if (oldestRunId !== undefined) this.#retiredRunIds.delete(oldestRunId);
  }

  #require(runId: string): ActiveRun {
    const run = this.#activeById.get(runId);
    if (!run) throw DaemonError.chatRunNotFound();
    return run;
  }
}

function materialize(
  run: ActiveRun,
  event: ChatStreamEvent,
  sequence: number,
): void {
  const content =
    run.snapshot.assistantMessage.content.map(cloneChatHistoryPart);
  let pendingElicitation = run.snapshot.pendingElicitation;
  let status = run.snapshot.status;

  switch (event.type) {
    case "delta":
      appendChatTextPart(content, event.part, event.text);
      break;
    case "plan":
      upsertChatPlanPart(content, event.plan);
      break;
    case "elicitation":
      upsertChatElicitationPart(content, event.elicitation);
      if (event.elicitation.phase === "open") {
        pendingElicitation = {
          ...structuredClone(event.elicitation),
          phase: "open",
        };
        status = "needsInput";
      } else if (pendingElicitation?.id === event.elicitation.id) {
        pendingElicitation = null;
        status = "running";
      }
      break;
    case "tool":
    case "toolDelta": {
      upsertToolPart(content, chatToolActionToPart(event.action));
      // A permission prompt reaches the client as a tool action awaiting a
      // decision, not as an `elicitation` event, so it has to raise the same
      // pending-input state or the run would look like it is still working.
      const decisionId = toolDecisionId(event.action);
      if (event.action.phase === "awaitingDecision") {
        pendingElicitation = permissionElicitationFromAction(event.action);
        status = "needsInput";
      } else if (pendingElicitation?.id === decisionId) {
        pendingElicitation = null;
        status = "running";
      }
      break;
    }
    case "result":
      content.splice(
        0,
        content.length,
        ...event.result.content.map(cloneChatHistoryPart),
      );
      break;
    case "error":
      content.push({
        data: {
          message: event.message,
          source: "runtime",
          type: "chat-error",
        },
        name: "chat-error",
        type: "data",
      });
      break;
    case "chat":
    case "done":
      break;
  }

  const base = {
    ...run.snapshot,
    assistantMessage: {
      ...run.snapshot.assistantMessage,
      content,
    },
    lastEventSequence: sequence,
    updatedAt: nextTimestamp(run.snapshot.updatedAt),
  };
  run.snapshot =
    status === "needsInput" && pendingElicitation !== null
      ? { ...base, pendingElicitation, status }
      : { ...base, pendingElicitation: null, status: "running" };
}

/** The id a tool action's pending decision is answered by. */
export function toolDecisionId(action: ChatToolAction): string {
  return action.elicitationId ?? action.id;
}

function permissionElicitationFromAction(
  action: ChatToolAction,
): ChatOpenElicitation {
  return {
    body: action.inputSummary ?? action.rawInput ?? null,
    id: toolDecisionId(action),
    kind: "approval",
    phase: "open",
    title: action.title ?? null,
  };
}

function upsertToolPart(
  parts: ChatHistoryMessagePart[],
  next: Extract<ChatHistoryMessagePart, { type: "tool-call" }>,
): void {
  const index = parts.findIndex(
    (part) => part.type === "tool-call" && part.toolCallId === next.toolCallId,
  );
  if (index === -1) parts.push(next);
  else parts[index] = next;
}

function userMessageContent(
  input: ChatRunStartInput,
): ChatHistoryMessagePart[] {
  const content: ChatHistoryMessagePart[] =
    input.text.length > 0 ? [{ text: input.text, type: "text" }] : [];
  for (const attachment of normalizeChatAttachmentsInput(input.attachments)) {
    switch (attachment.type) {
      case "image":
        content.push({
          filename: attachment.name ?? undefined,
          image: imageDataUrl(attachment.data, attachment.mimeType),
          mimeType: attachment.mimeType,
          type: "image",
        });
        break;
      case "file":
        content.push({
          data: attachment.data,
          filename: attachment.name ?? undefined,
          mimeType: attachment.mimeType,
          type: "file",
        });
        break;
      case "fileMention":
        content.push({
          data: attachment.path,
          filename: attachment.name ?? undefined,
          mention: true,
          mimeType: attachment.mimeType ?? "application/octet-stream",
          path: attachment.path,
          type: "file",
        });
        break;
      case "skillMention":
        content.push({
          data: attachment.path,
          filename: attachment.name,
          mention: true,
          mimeType: "text/plain",
          path: attachment.path,
          type: "file",
        });
        break;
    }
  }
  return content;
}

function cloneSnapshot(snapshot: ChatActiveRunSnapshot): ChatActiveRunSnapshot {
  return structuredClone(snapshot);
}

function nextTimestamp(previous: string): string {
  const now = new Date().toISOString();
  return now < previous ? previous : now;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
