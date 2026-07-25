import type {
  ChatActiveRunSnapshot,
  ChatAttachmentInput,
  ChatElicitationResponse,
  ChatHistoryMessagePart,
  ChatOpenElicitation,
  ChatRunObserverEvent,
  ChatRunStartInput,
  ChatSendResult,
  ChatStreamEvent,
} from "@angel-engine/daemon-api/chat";
import type { ChatStreamControls } from "./runtime";

import {
  appendChatTextPart,
  chatToolActionToPart,
  imageDataUrl,
  normalizeChatAttachmentsInput,
  upsertChatElicitationPart,
  upsertChatPlanPart,
} from "@angel-engine/daemon-api/chat";
import { DaemonError } from "../../platform/errors";

type ChatRunObserver = (message: ChatRunObserverEvent) => void;

export type ChatRunExecutor = (
  input: ChatRunStartInput,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal,
  controls: ChatStreamControls,
) => Promise<ChatSendResult>;

interface ActiveChatRun {
  abortController: AbortController;
  input: ChatRunStartInput;
  launched: boolean;
  observers: Set<ChatRunObserver>;
  resolveElicitation?: (
    elicitationId: string,
    response: ChatElicitationResponse,
  ) => Promise<void>;
  snapshot: ChatActiveRunSnapshot;
}

export class ChatRunRegistry {
  readonly #byChatId = new Map<string, ActiveChatRun>();
  readonly #byRunId = new Map<string, ActiveChatRun>();
  readonly #execute: ChatRunExecutor;
  readonly #publishEvent?: (runId: string, event: ChatStreamEvent) => void;

  constructor(options: {
    execute: ChatRunExecutor;
    publishEvent?: (runId: string, event: ChatStreamEvent) => void;
  }) {
    this.#execute = options.execute;
    this.#publishEvent = options.publishEvent;
  }

  prepare(runId: string, input: ChatRunStartInput): ChatActiveRunSnapshot {
    if (this.#byRunId.has(runId) || this.#byChatId.has(input.chatId)) {
      throw DaemonError.chatRunAlreadyActive();
    }

    const startedAt = new Date().toISOString();
    const attachments = normalizeChatAttachmentsInput(input.attachments);
    const userContent: ChatHistoryMessagePart[] = attachments.map(
      attachmentInputToHistoryPartWithFallback,
    );
    if (input.text.length > 0) {
      userContent.unshift({ text: input.text, type: "text" });
    }

    const snapshot: ChatActiveRunSnapshot = {
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
        content: userContent,
        createdAt: startedAt,
        id: `${runId}:user`,
        role: "user",
      },
    };
    const run: ActiveChatRun = {
      abortController: new AbortController(),
      input: { ...input, attachments },
      launched: false,
      observers: new Set(),
      snapshot,
    };
    this.#byRunId.set(runId, run);
    this.#byChatId.set(input.chatId, run);
    return structuredClone(snapshot);
  }

  activeForChat(chatId: string): ChatActiveRunSnapshot | null {
    const run = this.#byChatId.get(chatId);
    return run === undefined ? null : structuredClone(run.snapshot);
  }

  attach(runId: string, observer: ChatRunObserver): () => void {
    const run = this.#requireRun(runId);
    run.observers.add(observer);
    this.#notify(run, observer, {
      snapshot: structuredClone(run.snapshot),
      type: "snapshot",
    });
    return () => run.observers.delete(observer);
  }

  launch(runId: string): void {
    const run = this.#requireRun(runId);
    if (run.launched) return;
    run.launched = true;
    void this.#run(run);
  }

  stop(runId: string): void {
    this.#byRunId.get(runId)?.abortController.abort();
  }

  async resolveElicitation(
    runId: string,
    elicitationId: string,
    response: ChatElicitationResponse,
  ): Promise<void> {
    const run = this.#requireRun(runId);
    if (
      run.snapshot.status !== "needsInput" ||
      run.snapshot.pendingElicitation.id !== elicitationId ||
      run.resolveElicitation === undefined
    ) {
      throw DaemonError.chatStreamNotWaiting();
    }

    const pending = run.snapshot.pendingElicitation;
    const sequence = run.snapshot.lastEventSequence;
    run.snapshot = {
      ...run.snapshot,
      pendingElicitation: null,
      status: "running",
      updatedAt: new Date().toISOString(),
    };
    try {
      await run.resolveElicitation(elicitationId, response);
    } catch (error) {
      if (
        this.#byRunId.get(runId) === run &&
        run.snapshot.status === "running" &&
        run.snapshot.lastEventSequence === sequence
      ) {
        run.snapshot = {
          ...run.snapshot,
          pendingElicitation: pending,
          status: "needsInput",
          updatedAt: new Date().toISOString(),
        };
      }
      throw error;
    }
  }

  async #run(run: ActiveChatRun): Promise<void> {
    try {
      const result = await this.#execute(
        run.input,
        (event) => this.#publish(run, event),
        run.abortController.signal,
        {
          setResolveElicitation: (handler) => {
            run.resolveElicitation = handler;
          },
        },
      );
      this.#publish(run, { result, type: "result" });
    } catch (error) {
      if (!run.abortController.signal.aborted) {
        this.#publish(run, { message: errorMessage(error), type: "error" });
      }
    } finally {
      try {
        this.#publish(run, { type: "done" });
      } finally {
        this.#byRunId.delete(run.snapshot.runId);
        this.#byChatId.delete(run.snapshot.chatId);
      }
    }
  }

  #publish(run: ActiveChatRun, event: ChatStreamEvent): void {
    const sequence = run.snapshot.lastEventSequence + 1;
    run.snapshot = reduceSnapshot(run.snapshot, event, sequence);
    try {
      this.#publishEvent?.(run.snapshot.runId, event);
    } catch {
      // The global activity feed is best-effort. It must not interrupt provider
      // execution or prevent terminal registry cleanup.
    }
    const message: ChatRunObserverEvent = { event, sequence, type: "event" };
    for (const observer of run.observers) {
      this.#notify(run, observer, structuredClone(message));
    }
  }

  #notify(
    run: ActiveChatRun,
    observer: ChatRunObserver,
    message: ChatRunObserverEvent,
  ): void {
    try {
      observer(message);
    } catch {
      run.observers.delete(observer);
    }
  }

  #requireRun(runId: string): ActiveChatRun {
    const run = this.#byRunId.get(runId);
    if (run === undefined) throw DaemonError.chatRunNotFound();
    return run;
  }
}

function reduceSnapshot(
  snapshot: ChatActiveRunSnapshot,
  event: ChatStreamEvent,
  sequence: number,
): ChatActiveRunSnapshot {
  const assistantContent = snapshot.assistantMessage.content.map((part) =>
    structuredClone(part),
  );
  let pendingElicitation =
    snapshot.status === "needsInput" ? snapshot.pendingElicitation : null;

  switch (event.type) {
    case "delta":
      appendChatTextPart(assistantContent, event.part, event.text);
      break;
    case "tool":
    case "toolDelta":
      upsertToolPart(assistantContent, chatToolActionToPart(event.action));
      break;
    case "plan":
      upsertChatPlanPart(assistantContent, event.plan);
      break;
    case "elicitation":
      upsertChatElicitationPart(assistantContent, event.elicitation);
      if (event.elicitation.phase === "open") {
        pendingElicitation = event.elicitation as ChatOpenElicitation;
      }
      break;
    case "result":
      assistantContent.splice(
        0,
        assistantContent.length,
        ...structuredClone(event.result.content),
      );
      break;
    case "error":
      assistantContent.push({
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
    ...snapshot,
    assistantMessage: {
      ...snapshot.assistantMessage,
      content: assistantContent,
    },
    lastEventSequence: sequence,
    updatedAt: new Date().toISOString(),
  };
  return pendingElicitation === null
    ? { ...base, pendingElicitation: null, status: "running" }
    : { ...base, pendingElicitation, status: "needsInput" };
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

function attachmentInputToHistoryPartWithFallback(
  input: ChatAttachmentInput,
): ChatHistoryMessagePart {
  if (input.type === "fileMention") {
    return {
      data: input.path,
      filename: input.name ?? undefined,
      mention: true,
      mimeType: input.mimeType ?? "application/octet-stream",
      path: input.path,
      type: "file",
    };
  }
  if (input.type === "image") {
    return {
      filename: input.name ?? undefined,
      image: imageDataUrl(input.data, input.mimeType),
      mimeType: input.mimeType,
      type: "image",
    };
  }
  if (input.type === "skillMention") {
    return {
      data: input.path,
      filename: input.name,
      mention: true,
      mimeType: "text/plain",
      path: input.path,
      type: "file",
    };
  }
  return {
    data: input.data,
    filename: input.name ?? undefined,
    mimeType: input.mimeType,
    type: "file",
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
