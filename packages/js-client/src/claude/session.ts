import type {
  ClientCommandResult,
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
  ModelInfo,
  PermissionResult,
  Query,
  SDKAssistantMessage,
  SDKControlInitializeResponse,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";

import type {
  ActiveClaudeTurn,
  ClaudeCodeSendTextRequest,
  ClaudeElicitationResponse,
  EngineEventJson,
  PendingPermission,
  SessionConfigValueJson,
  SessionPermissionModeJson,
} from "./types.js";
import {
  AngelEngineClient,
  ClientProtocol,
  EngineEventActionKind,
  EngineEventActionOutputKind,
  EngineEventActionPhase,
  EngineEventContextScope,
  EngineEventContextUpdateType,
  EngineEventElicitationKind,
  EngineEventElicitationPhase,
  EngineEventTurnOutcome,
  EngineEventType,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { emptyUpdate } from "../utils/client-update.js";
import { abortError, errorMessage, throwIfAborted } from "../utils/errors.js";
import { ClaudeCodeEngineAdapter } from "./adapter.js";
import { contextPatch, contextUpdated } from "./context.js";
import {
  claudeElicitationBody,
  claudeElicitationChoices,
  claudeElicitationKind,
  claudeElicitationQuestions,
  updatedInputFromElicitationResponse,
} from "./elicitation.js";
import {
  actionObserved,
  actionOutputUpdated,
  activeTurnSnapshot,
  assistantDelta,
  availableCommandsUpdated,
  configValuesFromIds,
  failedOutcome,
  modelInfoForId,
  modelStateFromModelInfo,
  permissionModeOptionsFromIds,
  reasoningDelta,
  sessionModelsUpdated,
  sessionUsageUpdated,
  turnRunEventsFromUpdate,
  turnTerminal,
} from "./events.js";
import { historyEventsFromSessionMessages } from "./history.js";
import { planEventsFromToolUse } from "./plan.js";
import {
  claudePrompt,
  emptyClaudePrompt,
  loadClaudeEffortLevelIds,
  loadClaudePermissionModeIds,
  loadClaudeSdk,
} from "./runtime.js";
import {
  isClaudeAssistantToolUseBlock,
  isClaudeContentBlockDeltaEvent,
  isClaudeContentBlockStartEvent,
  isClaudeUserToolResultBlock,
  type ClaudeToolInput,
} from "./sdk-types.js";
import {
  stringifyToolResult,
  toolInputSummary,
  toolOutputKind,
} from "./tooling.js";
import {
  claudeEffort,
  compactEvents,
  normalizeClaudeMode,
  permissionDecision,
} from "./utils.js";

type NativeEngineClient = InstanceType<typeof AngelEngineClient>;

export class ClaudeCodeSession {
  private readonly adapter = new ClaudeCodeEngineAdapter();
  private readonly client: NativeEngineClient;
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private activeQuery?: Query;
  private availableEfforts: SessionConfigValueJson[] = [];
  private availablePermissionModes: SessionPermissionModeJson[] = [];
  private conversationId?: string;
  private currentPermissionMode = "default";
  private currentModel?: string;
  private currentReasoningEffort = "high";
  private modelInfos: ModelInfo[] = [];
  private operationQueue = Promise.resolve();
  private runtimeConfigurationLoaded = false;
  private replayedSessionId?: string;

  constructor() {
    this.client = new AngelEngineClient(
      {
        auth: { autoAuthenticate: false, needAuth: false },
        command: "claude",
        identity: {
          name: "angel-engine",
          title: "Angel Engine",
        },
        protocol: ClientProtocol.Custom,
      },
      this.adapter,
    );
    this.client.initialize();
  }

  close(): void {
    for (const pending of this.pendingPermissions.values()) {
      pending.reject(new Error("Chat session closed."));
    }
    this.pendingPermissions.clear();
    this.activeQuery?.close();
    this.activeQuery = undefined;
  }

  hasConversation(): boolean {
    return Boolean(this.conversationId);
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
      this.currentPermissionMode = normalizeClaudeMode(request.mode);
      this.applyEngineEvents([
        this.sessionPermissionModesUpdated(conversation.id),
        contextUpdated(conversation.id, [
          {
            [EngineEventContextUpdateType.PermissionMode]: {
              mode: { id: this.currentPermissionMode },
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
    const input = request.input;
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
      model: request.model ?? this.currentModel,
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
      this.activeQuery = query;

      await this.applyInitialization(query, active).catch(() => undefined);

      for await (const message of query) {
        throwIfAborted(request.signal);
        await this.acceptSdkMessage(message, active);
      }
      return this.finishTurn(active);
    } catch (error) {
      this.applyEngineEvents([
        turnTerminal(
          active.conversationId,
          active.turnId,
          failedOutcome(errorMessage(error)),
        ),
      ]);
      throw error;
    } finally {
      request.signal?.removeEventListener?.("abort", abort);
      if (this.activeQuery) {
        this.activeQuery = undefined;
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
        request.reasoningEffort ?? this.currentReasoningEffort,
      ),
      includePartialMessages: true,
      model: request.model ?? this.currentModel,
      permissionMode: normalizeClaudeMode(
        request.permissionMode ?? this.currentPermissionMode,
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
        return this.partialAssistantEvents(message, active);
      case "assistant":
        return this.assistantEvents(message, active);
      case "user":
        return this.userMessageEvents(message, active);
      case "result":
        active.finalResult = message;
        return this.resultEvents(message, active);
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
      default:
        return [];
    }
  }

  private systemEvents(
    message: Extract<SDKMessage, { type: "system" }>,
    active: ActiveClaudeTurn,
  ): EngineEventJson[] {
    if (message.subtype !== "init") return [];
    const init = message;
    active.sessionId = init.session_id;
    this.currentPermissionMode = normalizeClaudeMode(init.permissionMode);
    this.currentModel = init.model;
    active.model = init.model;
    this.updateEffortsForModel(init.model);
    const updates: EngineEventJson[] = [];
    const context = contextPatch([
      { Cwd: { cwd: init.cwd, scope: "Conversation" } },
      { Model: { model: init.model, scope: "TurnAndFuture" } },
      {
        [EngineEventContextUpdateType.PermissionMode]: {
          mode: { id: this.currentPermissionMode },
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
        modelStateFromModelInfo(this.modelInfos, init.model),
      ),
    );
    const reasoningEvent = this.reasoningConfigUpdated(active.conversationId);
    if (reasoningEvent) updates.push(reasoningEvent);
    return updates;
  }

  private partialAssistantEvents(
    message: SDKPartialAssistantMessage,
    active: ActiveClaudeTurn,
  ): EngineEventJson[] {
    const event = message.event;
    if (isClaudeContentBlockStartEvent(event)) {
      const contentBlock = event.content_block;
      if (isClaudeAssistantToolUseBlock(contentBlock)) {
        if (!is.nonEmptyString(contentBlock.id)) {
          throw new Error("Claude tool_use block is missing id.");
        }
        if (!is.plainObject(contentBlock.input)) {
          throw new Error("Claude tool_use block input must be an object.");
        }
        return [
          actionObserved(
            active,
            contentBlock.id,
            contentBlock.name,
            contentBlock.input as ClaudeToolInput,
          ),
        ];
      }
      return [];
    }

    if (!isClaudeContentBlockDeltaEvent(event)) return [];
    const delta = event.delta;
    if (delta.type === "text_delta") {
      const text = delta.text;
      active.sawTextDelta = active.sawTextDelta || text.length > 0;
      return text
        ? [assistantDelta(active.conversationId, active.turnId, text)]
        : [];
    }
    if (delta.type === "thinking_delta") {
      const text = delta.thinking;
      active.sawReasoningDelta = active.sawReasoningDelta || text.length > 0;
      return text
        ? [reasoningDelta(active.conversationId, active.turnId, text)]
        : [];
    }
    return [];
  }

  private assistantEvents(
    message: SDKAssistantMessage,
    active: ActiveClaudeTurn,
  ): EngineEventJson[] {
    const events: EngineEventJson[] = [];
    const content = message.message.content;
    for (const block of content) {
      if (block.type === "text" && !active.sawTextDelta) {
        const text = block.text;
        if (text) {
          events.push(
            assistantDelta(active.conversationId, active.turnId, text),
          );
        }
      } else if (block.type === "thinking" && !active.sawReasoningDelta) {
        const text = block.thinking;
        if (text) {
          events.push(
            reasoningDelta(active.conversationId, active.turnId, text),
          );
        }
      } else if (isClaudeAssistantToolUseBlock(block)) {
        if (!is.nonEmptyString(block.id)) {
          throw new Error("Claude tool_use block is missing id.");
        }
        if (!is.plainObject(block.input)) {
          throw new Error("Claude tool_use block input must be an object.");
        }
        const toolName = block.name;
        const input = block.input as ClaudeToolInput;
        events.push(actionObserved(active, block.id, toolName, input));
        events.push(...planEventsFromToolUse(active, toolName, input));
      }
    }
    return events;
  }

  private userMessageEvents(
    message: SDKUserMessage,
    active: ActiveClaudeTurn,
  ): EngineEventJson[] {
    const content = message.message.content;
    const events: EngineEventJson[] = [];
    for (const block of content) {
      if (!isClaudeUserToolResultBlock(block)) continue;
      if (!is.nonEmptyString(block.tool_use_id)) {
        throw new Error("Claude tool_result block is missing tool_use_id.");
      }
      const actionId = block.tool_use_id;
      const output = stringifyToolResult(block.content);
      if (block.is_error && !output) {
        throw new Error("Claude tool error result is missing content.");
      }
      events.push({
        ActionUpdated: {
          action_id: actionId,
          conversation_id: active.conversationId,
          patch: {
            error: block.is_error
              ? {
                  code: "claude.tool_failed",
                  message: output,
                  recoverable: true,
                }
              : null,
            output_delta: {
              [toolOutputKind(actionId, output, active)]: output,
            },
            phase: block.is_error
              ? EngineEventActionPhase.Failed
              : EngineEventActionPhase.Completed,
            title: null,
          },
        },
      });
    }
    return events;
  }

  private resultEvents(
    message: SDKResultMessage,
    active: ActiveClaudeTurn,
  ): EngineEventJson[] {
    if (
      message.subtype === "success" &&
      !active.sawTextDelta &&
      message.result
    ) {
      active.sawTextDelta = true;
      return [
        assistantDelta(active.conversationId, active.turnId, message.result),
        turnTerminal(
          active.conversationId,
          active.turnId,
          EngineEventTurnOutcome.Succeeded,
        ),
        sessionUsageUpdated(active.conversationId, message),
      ];
    }
    return [
      turnTerminal(
        active.conversationId,
        active.turnId,
        message.subtype === "success"
          ? EngineEventTurnOutcome.Succeeded
          : failedOutcome(message.errors?.join("\n") || message.subtype),
      ),
      sessionUsageUpdated(active.conversationId, message),
    ];
  }

  private canUseTool(active: ActiveClaudeTurn): CanUseTool {
    return async (toolName, input, context) => {
      const toolInput: ClaudeToolInput = input;
      const actionId = context.toolUseID || `permission-${Date.now()}`;
      const pending = this.createPendingPermission(actionId);
      const inputSummary = toolInputSummary(toolName, toolInput);
      const elicitationKind = claudeElicitationKind(toolName, toolInput);
      const events = [
        actionObserved(active, actionId, toolName, toolInput),
        {
          ElicitationOpened: {
            conversation_id: active.conversationId,
            elicitation: {
              action_id: actionId,
              id: actionId,
              kind: elicitationKind,
              options: {
                body: claudeElicitationBody(
                  toolName,
                  toolInput,
                  context,
                  inputSummary,
                ),
                choices: claudeElicitationChoices(toolName, toolInput),
                questions: claudeElicitationQuestions(toolName, toolInput),
                title:
                  context.title ??
                  context.displayName ??
                  (elicitationKind === EngineEventElicitationKind.UserInput
                    ? "Question"
                    : `Allow ${toolName}?`),
              },
              phase: EngineEventElicitationPhase.Open,
              remote_request_id: { Local: actionId },
              turn_id: active.turnId,
            },
          },
        },
      ];
      this.emitEngineEvents(events, active.request.onEvent);

      const response = await pending.promise;
      const decision = permissionDecision(response);
      this.emitEngineEvents(
        [
          {
            ElicitationResolved: {
              conversation_id: active.conversationId,
              decision,
              elicitation_id: actionId,
            },
          },
        ],
        active.request.onEvent,
      );
      if (response.type === "allow" || response.type === "allowForSession") {
        return {
          behavior: "allow",
          decisionClassification:
            response.type === "allowForSession"
              ? "user_permanent"
              : "user_temporary",
          toolUseID: actionId,
          updatedInput: input,
          updatedPermissions:
            response.type === "allowForSession"
              ? context.suggestions
              : undefined,
        } satisfies PermissionResult;
      }
      if (response.type === "answers") {
        return {
          behavior: "allow",
          toolUseID: actionId,
          updatedInput: updatedInputFromElicitationResponse(
            toolName,
            toolInput,
            response,
          ),
        } satisfies PermissionResult;
      }
      return {
        behavior: "deny",
        decisionClassification: "user_reject",
        interrupt: response.type === "cancel",
        message:
          response.type === "cancel" ? "Cancelled by user." : "Denied by user.",
        toolUseID: actionId,
      } satisfies PermissionResult;
    };
  }

  private createPendingPermission(elicitationId: string): PendingPermission {
    const existing = this.pendingPermissions.get(elicitationId);
    if (existing) return existing;

    let resolve!: (response: ClaudeElicitationResponse) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<ClaudeElicitationResponse>(
      (resolvePromise, rejectPromise) => {
        resolve = (response): void => {
          this.pendingPermissions.delete(elicitationId);
          resolvePromise(response);
        };
        reject = (error): void => {
          this.pendingPermissions.delete(elicitationId);
          rejectPromise(error);
        };
      },
    );
    const pending = { promise, reject, resolve };
    this.pendingPermissions.set(elicitationId, pending);
    return pending;
  }

  private async resolveElicitationNow(
    elicitationId: string,
    response: ClaudeElicitationResponse,
  ): Promise<void> {
    const pending = this.pendingPermissions.get(elicitationId);
    if (!pending) {
      throw new Error("Chat stream is not waiting for this user input.");
    }
    pending.resolve(response);
  }

  private startEngineTurn(
    conversationId: string,
    text: string,
    input: NonNullable<SendTextRequest["input"]>,
  ): { turnId: string } {
    const result = this.client.sendThreadEvent(conversationId, {
      input: [{ text, type: "text" }, ...input],
      type: "inputs",
    });
    if (!result.turnId) {
      throw new Error("Claude Code turn did not produce an engine turn id.");
    }
    return { turnId: result.turnId };
  }

  private finishTurn(active: ActiveClaudeTurn): TurnRunResult {
    const snapshot = this.requireConversation();
    const turn = activeTurnSnapshot(snapshot, active.turnId);
    const actions = snapshot.actions.filter(
      (action) => action.turnId === active.turnId,
    );
    const resultText =
      turn?.outputText ||
      (active.finalResult?.subtype === "success"
        ? active.finalResult.result
        : "") ||
      "Claude Code finished without text output.";

    return {
      actions,
      conversation: snapshot,
      model: snapshot.settings.modelList.currentModelId ?? active.model,
      reasoning: turn?.reasoningText || undefined,
      remoteThreadId:
        snapshot.remoteKind === "known" ? snapshot.remoteId : undefined,
      text: resultText,
      turn,
      turnId: active.turnId,
    };
  }

  private ensureConversation(input: {
    cwd?: string;
    remoteId?: string;
  }): ConversationSnapshot {
    if (this.conversationId) {
      return this.requireConversation();
    }

    const result = input.remoteId
      ? this.client.resumeThread({
          cwd: input.cwd,
          hydrate: false,
          remoteId: input.remoteId,
        })
      : this.startConversation(input.cwd);
    if (!result.conversationId) {
      throw new Error("Claude Code runtime did not start a conversation.");
    }
    this.conversationId = result.conversationId;
    this.applyEngineEvents(
      this.initialConversationEvents(result.conversationId),
    );
    return this.requireConversation();
  }

  private startConversation(cwd: string | undefined): ClientCommandResult {
    if (!is.string(cwd) || cwd.length === 0) {
      throw new Error("Claude Code conversation cwd is required.");
    }
    return this.client.startThread({ cwd });
  }

  private initialConversationEvents(conversationId: string): EngineEventJson[] {
    return compactEvents([
      this.sessionPermissionModesUpdated(conversationId),
      this.reasoningConfigUpdated(conversationId),
    ]);
  }

  private async loadRuntimeConfiguration(cwd?: string): Promise<void> {
    if (this.runtimeConfigurationLoaded || !this.conversationId) return;
    const sdk = await loadClaudeSdk();
    const query = sdk.query({
      prompt: emptyClaudePrompt(),
      options: {
        cwd,
        permissionMode: normalizeClaudeMode(this.currentPermissionMode),
      },
    });
    try {
      const result = await query.initializationResult();
      await this.applyRuntimeConfiguration(
        this.conversationId,
        result,
        this.currentModel,
      );
    } finally {
      query.close();
    }
  }

  private async applyRuntimeConfiguration(
    conversationId: string,
    result: SDKControlInitializeResponse,
    currentModel?: string,
  ): Promise<void> {
    this.modelInfos = result.models;
    const [modeIds, fallbackEffortLevels] = await Promise.all([
      loadClaudePermissionModeIds(),
      loadClaudeEffortLevelIds(),
    ]);
    this.availablePermissionModes = permissionModeOptionsFromIds(
      modeIds,
      this.currentPermissionMode,
    );
    this.updateEffortsForModel(currentModel, fallbackEffortLevels);

    this.applyEngineEvents(
      compactEvents([
        availableCommandsUpdated(conversationId, result.commands),
        sessionModelsUpdated(
          conversationId,
          modelStateFromModelInfo(result.models, currentModel),
        ),
        this.sessionPermissionModesUpdated(conversationId),
        this.reasoningConfigUpdated(conversationId),
      ]),
    );
    this.runtimeConfigurationLoaded = true;
  }

  private async replayHistory(remoteId?: string, cwd?: string): Promise<void> {
    if (
      !remoteId ||
      this.replayedSessionId === remoteId ||
      !this.conversationId
    ) {
      return;
    }
    const sdk = await loadClaudeSdk();
    const messages = await sdk.getSessionMessages(remoteId, { dir: cwd });
    const events = historyEventsFromSessionMessages(
      this.conversationId,
      messages,
    );
    if (events.length > 0) {
      this.applyEngineEvents(events);
    }
    this.replayedSessionId = remoteId;
  }

  private applySelections(
    conversationId: string,
    request: SendTextRequest,
  ): void {
    const events: EngineEventJson[] = [];
    if (request.permissionMode) {
      this.currentPermissionMode = normalizeClaudeMode(request.permissionMode);
      events.push(this.sessionPermissionModesUpdated(conversationId));
      events.push(
        contextUpdated(conversationId, [
          {
            [EngineEventContextUpdateType.PermissionMode]: {
              mode: { id: this.currentPermissionMode },
              scope: EngineEventContextScope.TurnAndFuture,
            },
          },
        ]),
      );
    }
    if (request.model) {
      this.currentModel = request.model;
      this.updateEffortsForModel(request.model);
      events.push(
        sessionModelsUpdated(
          conversationId,
          modelStateFromModelInfo(this.modelInfos, request.model),
        ),
      );
      events.push(
        contextUpdated(conversationId, [
          { Model: { model: request.model, scope: "TurnAndFuture" } },
        ]),
      );
    }
    if (request.reasoningEffort) {
      this.currentReasoningEffort = request.reasoningEffort;
      const reasoningEvent = this.reasoningConfigUpdated(conversationId);
      if (reasoningEvent) events.push(reasoningEvent);
      events.push(
        contextUpdated(conversationId, [
          {
            Reasoning: {
              reasoning: { effort: request.reasoningEffort },
              scope: "TurnAndFuture",
            },
          },
        ]),
      );
    }
    if (events.length > 0) {
      this.applyEngineEvents(events);
    }
  }

  private sessionPermissionModesUpdated(
    conversationId: string,
  ): EngineEventJson {
    if (this.availablePermissionModes.length === 0) {
      throw new Error("Claude permission modes are not loaded.");
    }
    return {
      [EngineEventType.SessionPermissionModesUpdated]: {
        conversation_id: conversationId,
        modes: {
          available_modes: this.availablePermissionModes,
          current_mode_id: this.currentPermissionMode,
        },
      },
    };
  }

  private reasoningConfigUpdated(
    conversationId: string,
  ): EngineEventJson | undefined {
    if (this.availableEfforts.length === 0) return undefined;
    return {
      SessionConfigOptionsUpdated: {
        conversation_id: conversationId,
        options: [
          {
            category: "thought_level",
            current_value: this.currentReasoningEffort,
            description: null,
            id: "reasoning_effort",
            name: "Reasoning",
            values: this.availableEfforts,
          },
        ],
      },
    };
  }

  private updateEffortsForModel(
    modelId?: string,
    fallbackEffortLevels: string[] = [],
  ): void {
    const modelInfo = modelInfoForId(this.modelInfos, modelId);
    const effortLevels = modelInfo?.supportedEffortLevels?.length
      ? modelInfo.supportedEffortLevels
      : modelInfo?.supportsEffort
        ? fallbackEffortLevels
        : [];
    this.availableEfforts = configValuesFromIds(effortLevels);
    if (
      this.availableEfforts.length > 0 &&
      !this.availableEfforts.some(
        (effort) => effort.value === this.currentReasoningEffort,
      )
    ) {
      this.currentReasoningEffort = this.availableEfforts[0].value;
    }
  }

  private emitEngineEvents(
    events: EngineEventJson[],
    onEvent?: (event: TurnRunEvent) => void,
  ): void {
    const update = this.applyEngineEvents(events);
    for (const event of turnRunEventsFromUpdate(update)) {
      onEvent?.(event);
    }
  }

  private applyEngineEvents(events: EngineEventJson[]): ClientUpdate {
    if (events.length === 0) return emptyUpdate();
    return this.client.receiveJson({
      jsonrpc: "2.0",
      method: "claude/event",
      params: { events },
    });
  }

  private requireConversation(): ConversationSnapshot {
    const conversationId = this.conversationId;
    if (!conversationId) {
      throw new Error("Claude Code conversation has not been initialized.");
    }
    const conversation = this.client.threadState(conversationId);
    if (!conversation) {
      throw new Error("Claude Code conversation is missing from engine state.");
    }
    return conversation;
  }

  private async enqueue<T>(action: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(action);
    this.operationQueue = run.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    return run;
  }
}
