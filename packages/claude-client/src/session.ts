import type {
  ClientUpdate,
  ConversationSnapshot,
  HydrateRequest,
  InspectRequest,
  SendTextRequest,
  SetModeRequest,
  SetPermissionModeRequest,
  TurnRunEvent,
  TurnRunResult,
} from "@angel-engine/client-napi";
import type {
  CanUseTool,
  Options as ClaudeQueryOptions,
  Query,
  SDKControlInitializeResponse,
  SDKMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type {
  ActiveClaudeTurn,
  ClaudeCodeSendTextRequest,
  ClaudeElicitationResponse,
  EngineEventJson,
} from "./types.js";
import {
  EngineEventActionKind,
  EngineEventActionOutputKind,
  EngineEventContextScope,
  EngineEventContextUpdateType,
  EngineEventTurnOutcome,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import {
  abortError,
  errorMessage,
  throwIfAborted,
} from "@angel-engine/js-client/utils/errors";
import { contextPatch, contextUpdated } from "./context.js";
import {
  actionOutputUpdated,
  availableCommandsUpdated,
  failedOutcome,
  modelStateFromModelInfo,
  sessionModelsUpdated,
  turnTerminal,
} from "./events.js";
import { claudePrompt, loadClaudeSdk } from "./runtime.js";
import {
  assistantEvents,
  isClaudeInitMessage,
  partialAssistantEvents,
  resultEvents,
  userMessageEvents,
} from "./session-message-events.js";
import {
  claudeCodeExecutable,
  ClaudeCodeSessionRuntime,
} from "./session-runtime.js";
import { claudeEffort, normalizeClaudeMode } from "./utils.js";

export class ClaudeCodeSession {
  private readonly runtime = new ClaudeCodeSessionRuntime();

  constructor() {}

  close(): void {
    this.runtime.close();
  }

  hasConversation(): boolean {
    return this.runtime.hasConversation();
  }

  processId(): undefined {
    // The pinned Claude Agent SDK owns its child process and exposes no pid.
    return undefined;
  }

  async hydrate(request: HydrateRequest): Promise<ConversationSnapshot> {
    return this.enqueue(async () => {
      this.ensureConversation({
        cwd: request.cwd,
        remoteId: request.remoteId,
      });
      await this.loadRuntimeConfiguration(request.cwd);
      await this.replayHistory(request.remoteId, request.cwd);
      return this.requireConversation();
    });
  }

  async inspect(cwd: string | InspectRequest): Promise<ConversationSnapshot> {
    const request: InspectRequest = typeof cwd === "string" ? { cwd } : cwd;
    return this.enqueue(async () => {
      this.ensureConversation({ cwd: request.cwd });
      await this.loadRuntimeConfiguration(request.cwd);
      return this.requireConversation();
    });
  }

  async setMode(request: SetModeRequest): Promise<ConversationSnapshot> {
    return this.enqueue(async () => {
      this.ensureConversation({
        cwd: request.cwd,
        remoteId: request.remoteId,
      });
      return this.requireConversation();
    });
  }

  async setPermissionMode(
    request: SetPermissionModeRequest,
  ): Promise<ConversationSnapshot> {
    return this.enqueue(async () => {
      const conversation = this.ensureConversation({
        cwd: request.cwd,
        remoteId: request.remoteId,
      });
      this.runtime.currentPermissionMode = normalizeClaudeMode(request.mode);
      this.applyEngineEvents([
        this.sessionPermissionModesUpdated(conversation.id),
        contextUpdated(conversation.id, [
          {
            [EngineEventContextUpdateType.PermissionMode]: {
              mode: { id: this.runtime.currentPermissionMode },
              scope: EngineEventContextScope.TurnAndFuture,
            },
          },
        ]),
      ]);
      return this.requireConversation();
    });
  }

  async sendText(request: ClaudeCodeSendTextRequest): Promise<TurnRunResult> {
    return this.enqueue(async () => this.sendTextNow(request));
  }

  private async sendTextNow(
    request: ClaudeCodeSendTextRequest,
  ): Promise<TurnRunResult> {
    if (!is.string(request.text)) {
      throw new Error("Claude sendText request is missing text.");
    }
    const text = request.text;
    const input = request.input ?? [];
    if (!text && input.length === 0) {
      throw new Error("Text or input is required.");
    }

    throwIfAborted(request.signal);
    request.onResolveElicitation?.(async (elicitationId, response) =>
      this.resolveElicitationNow(elicitationId, response),
    );

    const conversation = this.ensureConversation({
      cwd: request.cwd,
      remoteId: request.remoteId,
    });
    this.applySelections(conversation.id, request);

    const turn = this.startEngineTurn(conversation.id, text, input);
    const active: ActiveClaudeTurn = {
      actionIds: new Set(),
      conversationId: conversation.id,
      model: request.model ?? this.runtime.currentModel,
      request,
      sawReasoningDelta: false,
      sawTextDelta: false,
      turnId: turn.turnId,
    };

    const abortController = new AbortController();
    const abort = (): void => abortController.abort(abortError(request.signal));
    request.signal?.addEventListener?.("abort", abort, { once: true });

    try {
      const sdk = await loadClaudeSdk();
      const query = sdk.query({
        prompt: claudePrompt(text, input),
        options: this.queryOptions(request, abortController, active),
      });
      this.runtime.activeQuery = query;

      await this.applyInitialization(query, active).catch(() => undefined);

      for await (const message of query) {
        throwIfAborted(request.signal);
        await this.acceptSdkMessage(message, active);
      }
      return this.finishTurn(active);
    } catch (error) {
      const outcome = claudeTurnErrorOutcome(request.signal, error);
      this.applyEngineEvents([
        turnTerminal(active.conversationId, active.turnId, outcome),
      ]);
      throw error;
    } finally {
      request.signal?.removeEventListener?.("abort", abort);
      if (this.runtime.activeQuery) {
        this.runtime.activeQuery = undefined;
      }
    }
  }

  private queryOptions(
    request: ClaudeCodeSendTextRequest,
    abortController: AbortController,
    active: ActiveClaudeTurn,
  ): ClaudeQueryOptions {
    return {
      abortController,
      additionalDirectories: [],
      canUseTool: this.canUseTool(active),
      cwd: request.cwd,
      effort: claudeEffort(
        request.reasoningEffort ?? this.runtime.currentReasoningEffort,
      ),
      includePartialMessages: true,
      model: request.model ?? this.runtime.currentModel,
      pathToClaudeCodeExecutable: claudeCodeExecutable(),
      permissionMode: normalizeClaudeMode(
        request.permissionMode ?? this.runtime.currentPermissionMode,
      ),
      resume: request.remoteId,
    };
  }

  private async applyInitialization(
    query: Query,
    active: ActiveClaudeTurn,
  ): Promise<void> {
    const result = await query.initializationResult();
    await this.applyRuntimeConfiguration(
      active.conversationId,
      result,
      active.model,
    );
  }

  private async acceptSdkMessage(
    message: SDKMessage,
    active: ActiveClaudeTurn,
  ): Promise<void> {
    const events = this.eventsFromSdkMessage(message, active);
    if (events.length > 0) {
      this.emitEngineEvents(events, active.request.onEvent);
    }
  }

  private eventsFromSdkMessage(
    message: SDKMessage,
    active: ActiveClaudeTurn,
  ): EngineEventJson[] {
    switch (message.type) {
      case "system":
        return this.systemEvents(message, active);
      case "stream_event":
        return partialAssistantEvents(message, active);
      case "assistant":
        return assistantEvents(message, active);
      case "user":
        return userMessageEvents(message, active);
      case "result":
        active.finalResult = message;
        return resultEvents(message, active);
      case "tool_use_summary":
        return message.summary
          ? [
              actionOutputUpdated(
                active.conversationId,
                active.turnId,
                `summary-${message.uuid}`,
                "Tool Summary",
                EngineEventActionKind.DynamicTool,
                message.summary,
                EngineEventActionOutputKind.Text,
              ),
            ]
          : [];
      case "auth_status":
      case "prompt_suggestion":
      case "rate_limit_event":
      case "tool_progress":
      case "control_request":
      case "conversation_reset":
        return [];
    }
    throw new Error(`Unsupported Claude SDK message type: ${message.type}`);
  }

  private systemEvents(
    message: Extract<SDKMessage, { type: "system" }>,
    active: ActiveClaudeTurn,
  ): EngineEventJson[] {
    if (!isClaudeInitMessage(message)) {
      switch (message.subtype) {
        case "api_retry":
        case "commands_changed":
        case "compact_boundary":
        case "elicitation_complete":
        case "files_persisted":
        case "hook_progress":
        case "hook_response":
        case "hook_started":
        case "informational":
        case "local_command_output":
        case "memory_recall":
        case "mirror_error":
        case "model_refusal_fallback":
        case "model_refusal_no_fallback":
        case "notification":
        case "permission_denied":
        case "plugin_install":
        case "session_state_changed":
        case "status":
        case "task_notification":
        case "task_progress":
        case "task_started":
        case "task_updated":
        case "thinking_tokens":
        case "worker_shutting_down":
          return [];
      }
      throw new Error(
        `Unsupported Claude SDK system message subtype: ${message.subtype}`,
      );
    }
    const init = message;
    active.sessionId = init.session_id;
    this.runtime.currentPermissionMode = normalizeClaudeMode(
      init.permissionMode,
    );
    this.runtime.currentModel = init.model;
    active.model = init.model;
    this.updateEffortsForModel(init.model);
    const updates: EngineEventJson[] = [];
    const context = contextPatch([
      { Cwd: { cwd: init.cwd, scope: "Conversation" } },
      { Model: { model: init.model, scope: "TurnAndFuture" } },
      {
        [EngineEventContextUpdateType.PermissionMode]: {
          mode: { id: this.runtime.currentPermissionMode },
          scope: EngineEventContextScope.TurnAndFuture,
        },
      },
    ]);
    updates.push({
      ConversationReady: {
        capabilities: null,
        context,
        id: active.conversationId,
        remote: { Known: init.session_id },
      },
    });
    updates.push(
      availableCommandsUpdated(
        active.conversationId,
        init.slash_commands.map((name) => ({
          argumentHint: "",
          description: "",
          name,
        })),
      ),
    );
    updates.push(this.sessionPermissionModesUpdated(active.conversationId));
    updates.push(
      sessionModelsUpdated(
        active.conversationId,
        modelStateFromModelInfo(this.runtime.modelInfos, init.model),
      ),
    );
    const reasoningEvent = this.reasoningConfigUpdated(active.conversationId);
    if (reasoningEvent) updates.push(reasoningEvent);
    return updates;
  }

  private canUseTool(active: ActiveClaudeTurn): CanUseTool {
    return this.runtime.canUseTool(active, (events, onEvent) =>
      this.emitEngineEvents(events, onEvent),
    );
  }

  private async resolveElicitationNow(
    elicitationId: string,
    response: ClaudeElicitationResponse,
  ): Promise<void> {
    this.runtime.resolveElicitation(elicitationId, response);
  }

  private startEngineTurn(
    conversationId: string,
    text: string,
    input: SendTextRequest["input"],
  ): { turnId: string } {
    return this.runtime.startEngineTurn(conversationId, text, input);
  }

  private finishTurn(active: ActiveClaudeTurn): TurnRunResult {
    const snapshot = this.requireConversation();
    if (snapshot.remoteKind === "known") {
      this.replayedSessionId = snapshot.remoteId;
    }

    return {
      conversation: snapshot,
      remoteThreadId:
        snapshot.remoteKind === "known" ? snapshot.remoteId : undefined,
      turnId: active.turnId,
    };
  }

  private ensureConversation(input: {
    cwd?: string;
    remoteId?: string;
  }): ConversationSnapshot {
    return this.runtime.ensureConversation(input);
  }

  private loadRuntimeConfiguration(cwd?: string): Promise<void> {
    return this.runtime.loadRuntimeConfiguration(cwd);
  }

  private applyRuntimeConfiguration(
    conversationId: string,
    result: SDKControlInitializeResponse,
    currentModel?: string,
  ): Promise<void> {
    return this.runtime.applyRuntimeConfiguration(
      conversationId,
      result,
      currentModel,
    );
  }

  private replayHistory(remoteId?: string, cwd?: string): Promise<void> {
    return this.runtime.replayHistory(remoteId, cwd);
  }

  private applySelections(
    conversationId: string,
    request: SendTextRequest,
  ): void {
    this.runtime.applySelections(conversationId, request);
  }

  private sessionPermissionModesUpdated(
    conversationId: string,
  ): EngineEventJson {
    return this.runtime.sessionPermissionModesUpdated(conversationId);
  }

  private reasoningConfigUpdated(
    conversationId: string,
  ): EngineEventJson | undefined {
    return this.runtime.reasoningConfigUpdated(conversationId);
  }

  private updateEffortsForModel(
    modelId?: string,
    fallbackEffortLevels: string[] = [],
  ): void {
    this.runtime.updateEffortsForModel(modelId, fallbackEffortLevels);
  }

  private emitEngineEvents(
    events: EngineEventJson[],
    onEvent?: (event: TurnRunEvent) => void,
  ): void {
    this.runtime.emitEngineEvents(events, onEvent);
  }

  private applyEngineEvents(events: EngineEventJson[]): ClientUpdate {
    return this.runtime.applyEngineEvents(events);
  }

  private requireConversation(): ConversationSnapshot {
    return this.runtime.requireConversation();
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    return this.runtime.enqueue(action);
  }

  private get replayedSessionId(): string | undefined {
    return this.runtime.replayedSessionId;
  }

  private set replayedSessionId(value: string | undefined) {
    this.runtime.replayedSessionId = value;
  }
}

export function claudeTurnErrorOutcome(
  signal: AbortSignal | undefined,
  error: unknown,
): unknown {
  return signal?.aborted
    ? EngineEventTurnOutcome.Interrupted
    : failedOutcome(errorMessage(error));
}
