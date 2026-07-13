import type {
  ConversationSnapshot,
  ElicitationResponse,
  HydrateRequest,
  InspectRequest,
  RuntimeOptions,
  SendTextRequest,
  SetModeRequest,
  SetPermissionModeRequest,
  TurnRunEvent,
  TurnRunResult,
} from "@angel-engine/client-napi";
import type { ChatElicitationResponse } from "../../../shared/chat";

import {
  ActionPhase,
  ElicitationResponseType,
  AngelSession as NativeAngelSession,
  TurnRunEventType,
} from "@angel-engine/client-napi";
import {
  abortError,
  throwIfAborted,
} from "@angel-engine/js-client/utils/errors";

type NativeAngelSessionInstance = InstanceType<typeof NativeAngelSession>;
type DesktopSendTextRequest = SendTextRequest & {
  input: NonNullable<SendTextRequest["input"]>;
  onEvent?: (event: TurnRunEvent) => void;
  onResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
  signal?: AbortSignal;
};

interface PendingElicitation {
  promise: Promise<TurnRunEvent[]>;
  reject: (error: Error) => void;
  resolve: (events?: TurnRunEvent[]) => void;
}

export class DesktopAngelSession {
  private readonly pendingElicitations = new Map<string, PendingElicitation>();
  private readonly session: NativeAngelSessionInstance;
  private operationQueue = Promise.resolve();

  constructor(options: RuntimeOptions) {
    this.session = new NativeAngelSession(options);
  }

  close(): void {
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error("Chat session closed."));
    }
    this.pendingElicitations.clear();
    this.session.close();
  }

  hasConversation(): boolean {
    return this.session.hasConversation();
  }

  processId(): number {
    return this.session.processId();
  }

  async hydrate(request: HydrateRequest): Promise<ConversationSnapshot> {
    return this.enqueue(async () => this.session.hydrate(request));
  }

  async inspect(cwd: string | InspectRequest): Promise<ConversationSnapshot> {
    const request: InspectRequest = typeof cwd === "string" ? { cwd } : cwd;
    return this.enqueue(async () => this.session.inspect(request));
  }

  async setMode(request: SetModeRequest): Promise<ConversationSnapshot> {
    return this.enqueue(async () => this.session.setMode(request));
  }

  async setPermissionMode(
    request: SetPermissionModeRequest,
  ): Promise<ConversationSnapshot> {
    return this.enqueue(async () => this.session.setPermissionMode(request));
  }

  async sendText(request: DesktopSendTextRequest): Promise<TurnRunResult> {
    return this.enqueue(async () => this.sendTextNow(request));
  }

  private async sendTextNow(
    request: DesktopSendTextRequest,
  ): Promise<TurnRunResult> {
    const text = request.text;
    const input = request.input;
    if (!text && input.length === 0) {
      throw new Error("Text or input is required.");
    }

    throwIfAborted(request.signal);
    request.onResolveElicitation?.(async (elicitationId, response) =>
      this.resolveElicitationNow(elicitationId, response),
    );

    try {
      let events = await this.session.startTextTurn({
        cwd: request.cwd,
        mode: request.mode,
        model: request.model,
        permissionMode: request.permissionMode,
        input,
        reasoningEffort: request.reasoningEffort,
        remoteId: request.remoteId,
        text,
      });

      for (;;) {
        const result = await this.dispatchEvents(events, request);
        if (result) return result;

        if (request.signal?.aborted) {
          await this.cancelNativeTurn().catch((): undefined => undefined);
          throwIfAborted(request.signal);
        }

        events = await this.session.nextTurnEvents(50);
        if (events.length === 0) {
          await yieldToEventLoop();
        }
      }
    } catch (error) {
      if (request.signal?.aborted) {
        await this.cancelNativeTurn().catch((): undefined => undefined);
        throwIfAborted(request.signal);
      }
      throw error;
    }
  }

  private async dispatchEvents(
    events: TurnRunEvent[],
    request: DesktopSendTextRequest,
  ): Promise<TurnRunResult | undefined> {
    for (const event of events) {
      request.onEvent?.(event);

      const openElicitationId = openElicitationEventId(event);
      if (openElicitationId !== undefined) {
        const followup = await this.waitForElicitation(
          openElicitationId,
          request.signal,
        );
        const result = await this.dispatchEvents(followup, request);
        if (result) return result;
        continue;
      }

      const actionElicitationId = pendingActionElicitationId(event);
      if (actionElicitationId !== undefined) {
        const followup = await this.waitForElicitation(
          actionElicitationId,
          request.signal,
        );
        const result = await this.dispatchEvents(followup, request);
        if (result) return result;
        continue;
      }

      if (event.type === "result" && event.result) {
        return event.result;
      }
    }

    return undefined;
  }

  private async enqueue<T>(action: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(action);
    this.operationQueue = run.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    return run;
  }

  private async waitForElicitation(
    elicitationId: string,
    signal?: AbortSignal,
  ): Promise<TurnRunEvent[]> {
    if (!elicitationId) {
      return Promise.reject(
        new Error("Runtime opened an invalid elicitation."),
      );
    }
    return this.preparePendingElicitation(elicitationId, signal).promise;
  }

  private preparePendingElicitation(
    elicitationId: string,
    signal?: AbortSignal,
  ): PendingElicitation {
    const existing = this.pendingElicitations.get(elicitationId);
    if (existing) return existing;

    let cleanup: () => void = () => undefined;
    let resolvePending!: (events?: TurnRunEvent[]) => void;
    let rejectPending!: (error: Error) => void;
    const promise = new Promise<TurnRunEvent[]>((resolve, reject) => {
      const abort = (): void => {
        this.cancelNativeTurn().catch((): undefined => undefined);
        rejectPending(abortError(signal));
      };
      cleanup = (): void => {
        signal?.removeEventListener?.("abort", abort);
        this.pendingElicitations.delete(elicitationId);
      };
      resolvePending = (events: TurnRunEvent[] = []): void => {
        cleanup();
        resolve(events);
      };
      rejectPending = (error: Error): void => {
        cleanup();
        reject(error);
      };
      signal?.addEventListener?.("abort", abort, { once: true });
    });

    const pending = {
      promise,
      reject: rejectPending,
      resolve: resolvePending,
    };
    this.pendingElicitations.set(elicitationId, pending);
    if (signal?.aborted) {
      pending.reject(abortError(signal));
    }
    return pending;
  }

  private async resolveElicitationNow(
    elicitationId: string,
    response: ChatElicitationResponse,
  ) {
    const pending = this.pendingElicitations.get(elicitationId);
    if (!pending) {
      throw new Error("Chat stream is not waiting for this user input.");
    }

    try {
      const events = await this.session.resolveElicitation(
        elicitationId,
        clientElicitationResponse(response),
      );
      pending.resolve(events);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private async cancelNativeTurn() {
    for (const pending of this.pendingElicitations.values()) {
      pending.reject(new Error("Chat request cancelled."));
    }
    this.pendingElicitations.clear();
    return this.session.cancelTurn();
  }
}

function pendingActionElicitationId(event: TurnRunEvent) {
  const action = turnRunEventAction(event);
  if (action?.phase !== ActionPhase.AwaitingDecision) {
    return undefined;
  }

  if (action.elicitationId !== undefined && action.elicitationId.length > 0) {
    return action.elicitationId;
  }
  if (action.id.length > 0) {
    return action.id;
  }
  return undefined;
}

function openElicitationEventId(event: TurnRunEvent) {
  if (event.type !== TurnRunEventType.Elicitation) {
    return undefined;
  }
  const action = turnRunEventAction(event);
  if (
    action?.kind !== "elicitation" ||
    action.phase !== ActionPhase.AwaitingDecision
  ) {
    return undefined;
  }
  return action.elicitationId ?? action.id;
}

function turnRunEventAction(event: TurnRunEvent) {
  return event.messagePart?.type === "tool-call"
    ? event.messagePart.action
    : undefined;
}

async function yieldToEventLoop() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function clientElicitationResponse(
  response: ChatElicitationResponse,
): ElicitationResponse {
  switch (response.type) {
    case "allow":
      return { type: ElicitationResponseType.Allow };
    case "allowForSession":
      return { type: ElicitationResponseType.AllowForSession };
    case "deny":
      return { type: ElicitationResponseType.Deny };
    case "cancel":
      return { type: ElicitationResponseType.Cancel };
    case "answers":
      return {
        answers: response.answers,
        type: ElicitationResponseType.Answers,
      };
    case "dynamicToolResult":
      return {
        success: response.success,
        type: ElicitationResponseType.DynamicToolResult,
      };
    case "externalComplete":
      return { type: ElicitationResponseType.ExternalComplete };
    case "raw":
      return {
        type: ElicitationResponseType.Raw,
        value: response.value,
      };
  }
}
