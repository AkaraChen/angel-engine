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
  ActivePiTurn,
  EngineEventJson,
  PiAgentMessage,
  PiAgentSession as PiSdkAgentSession,
  PiAgentSessionEvent,
  PiModel,
  PiModelRegistry,
  PiSendTextRequest,
  PiThinkingLevel,
  SessionConfigValueJson,
} from "./types.js";

import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  AngelEngineClient,
  ClientProtocol,
  EngineEventActionPhase,
  EngineEventContextScope,
  EngineEventContextUpdateType,
  EngineEventTurnOutcome,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { emptyUpdate } from "@angel-engine/js-client/utils/client-update";
import {
  errorMessage,
  throwIfAborted,
} from "@angel-engine/js-client/utils/errors";
import { PiEngineAdapter } from "./adapter.js";
import { contextPatch, contextUpdated } from "./context.js";
import {
  actionObserved,
  actionOutputUpdated,
  assistantDelta,
  availableCommandsUpdated,
  configValuesFromIds,
  failedOutcome,
  modelStateFromModels,
  piModelId,
  reasoningDelta,
  sessionModelsUpdated,
  sessionUsageUpdated,
  turnRunEventsFromUpdate,
  turnTerminal,
} from "./events.js";
import { historyEventsFromSessionMessages } from "./history.js";
import { piPrompt, piThinkingLevel, piThinkingLevelIds } from "./runtime.js";

type NativeEngineClient = InstanceType<typeof AngelEngineClient>;

export class PiAgentSession {
  private readonly adapter = new PiEngineAdapter();
  private readonly client: NativeEngineClient;
  private activeTurn?: ActivePiTurn;
  private availableEfforts: SessionConfigValueJson[] = [];
  private conversationId?: string;
  private currentModel?: PiModel;
  private currentReasoningEffort: PiThinkingLevel = "medium";
  private modelInfos: PiModel[] = [];
  private modelRegistry?: PiModelRegistry;
  private operationQueue = Promise.resolve();
  private piSession?: PiSdkAgentSession;
  private replayedSessionId?: string;
  private runtimeConfigurationLoaded = false;
  private sessionCwd?: string;
  private unsubscribe?: () => void;

  constructor() {
    this.client = new AngelEngineClient(
      {
        auth: { autoAuthenticate: false, needAuth: false },
        command: "pi",
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
    void this.piSession?.abort().catch(() => undefined);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.piSession?.dispose();
    this.piSession = undefined;
  }

  hasConversation(): boolean {
    return Boolean(this.conversationId);
  }

  async hydrate(request: HydrateRequest): Promise<ConversationSnapshot> {
    return this.enqueue(async () => {
      const conversation = this.ensureConversation({
        cwd: request.cwd,
        remoteId: request.remoteId,
      });
      await this.ensurePiSession({
        cwd: request.cwd,
        remoteId: request.remoteId,
      });
      await this.loadRuntimeConfiguration(request.cwd);
      await this.replayHistory(
        request.remoteId ?? this.piSession?.sessionFile,
        conversation.id,
      );
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
      await this.loadRuntimeConfiguration(request.cwd);
      return this.requireConversation();
    });
  }

  async setPermissionMode(
    request: SetPermissionModeRequest,
  ): Promise<ConversationSnapshot> {
    return this.enqueue(async () => {
      this.ensureConversation({
        cwd: request.cwd,
        remoteId: request.remoteId,
      });
      await this.loadRuntimeConfiguration(request.cwd);
      return this.requireConversation();
    });
  }

  async sendText(request: PiSendTextRequest): Promise<TurnRunResult> {
    return this.enqueue(async () => this.sendTextNow(request));
  }

  private async sendTextNow(
    request: PiSendTextRequest,
  ): Promise<TurnRunResult> {
    if (!is.string(request.text)) {
      throw new Error("Pi sendText request is missing text.");
    }
    const text = request.text;
    const input = request.input ?? [];
    if (!text && input.length === 0) {
      throw new Error("Text or input is required.");
    }

    throwIfAborted(request.signal);

    const conversation = this.ensureConversation({
      cwd: request.cwd,
      remoteId: request.remoteId,
    });
    const session = await this.ensurePiSession({
      cwd: request.cwd,
      remoteId: request.remoteId,
    });
    await this.loadRuntimeConfiguration(request.cwd);
    await this.applySelections(conversation.id, request);

    const turn = this.startEngineTurn(conversation.id, text, input);
    const active: ActivePiTurn = {
      actionIds: new Set(),
      conversationId: conversation.id,
      request,
      sawReasoningDelta: false,
      sawTextDelta: false,
      terminalEmitted: false,
      turnId: turn.turnId,
    };

    const abort = (): void => {
      void session.abort().catch(() => undefined);
    };
    request.signal?.addEventListener?.("abort", abort, { once: true });
    this.activeTurn = active;

    try {
      const prompt = piPrompt(text, input);
      await session.prompt(prompt.text, {
        ...(prompt.images.length > 0 ? { images: prompt.images } : {}),
      });
      this.emitTerminalIfNeeded(active, piTurnOutcome(request.signal, active));
      return this.finishTurn(active);
    } catch (error) {
      const outcome = piTurnErrorOutcome(request.signal, error);
      this.emitTerminalIfNeeded(active, outcome);
      throw error;
    } finally {
      request.signal?.removeEventListener?.("abort", abort);
      if (this.activeTurn === active) {
        this.activeTurn = undefined;
      }
    }
  }

  private eventsFromSdkEvent(
    event: PiAgentSessionEvent,
    active: ActivePiTurn,
  ): EngineEventJson[] {
    switch (event.type) {
      case "message_update": {
        const messageEvent = event.assistantMessageEvent;
        if (messageEvent.type === "text_delta") {
          active.sawTextDelta =
            active.sawTextDelta || messageEvent.delta.length > 0;
          return messageEvent.delta
            ? [
                assistantDelta(
                  active.conversationId,
                  active.turnId,
                  messageEvent.delta,
                ),
              ]
            : [];
        }
        if (messageEvent.type === "thinking_delta") {
          active.sawReasoningDelta =
            active.sawReasoningDelta || messageEvent.delta.length > 0;
          return messageEvent.delta
            ? [
                reasoningDelta(
                  active.conversationId,
                  active.turnId,
                  messageEvent.delta,
                ),
              ]
            : [];
        }
        if (messageEvent.type === "done") {
          active.finalMessage = messageEvent.message;
        } else if (messageEvent.type === "error") {
          active.finalMessage = messageEvent.error;
        }
        return [];
      }
      case "message_end":
        return this.messageEndEvents(event.message, active);
      case "turn_end": {
        const events = this.messageEndEvents(event.message, active);
        const usageMessage =
          active.finalMessage ??
          (event.message.role === "assistant" ? event.message : undefined);
        const usageEvent = usageMessage
          ? sessionUsageUpdated(
              active.conversationId,
              usageMessage,
              this.currentModel,
            )
          : undefined;
        return usageEvent ? [...events, usageEvent] : events;
      }
      case "tool_execution_start":
        return [
          actionObserved(active, event.toolCallId, event.toolName, event.args),
        ];
      case "tool_execution_update":
        return [
          actionOutputUpdated(
            active,
            event.toolCallId,
            event.toolName,
            event.partialResult,
            EngineEventActionPhase.StreamingResult,
            false,
          ),
        ];
      case "tool_execution_end":
        return [
          actionOutputUpdated(
            active,
            event.toolCallId,
            event.toolName,
            event.result,
            event.isError
              ? EngineEventActionPhase.Failed
              : EngineEventActionPhase.Completed,
            event.isError,
          ),
        ];
      case "agent_start":
      case "agent_end":
      case "turn_start":
      case "message_start":
      case "queue_update":
      case "compaction_start":
      case "compaction_end":
      case "auto_retry_start":
      case "auto_retry_end":
      case "session_info_changed":
      case "thinking_level_changed":
        return [];
    }
  }

  private messageEndEvents(
    message: PiAgentMessage,
    active: ActivePiTurn,
  ): EngineEventJson[] {
    if (message.role !== "assistant") return [];
    active.finalMessage = message;
    const events: EngineEventJson[] = [];
    for (const block of message.content) {
      if (block.type === "text" && !active.sawTextDelta && block.text) {
        active.sawTextDelta = true;
        events.push(
          assistantDelta(active.conversationId, active.turnId, block.text),
        );
      } else if (
        block.type === "thinking" &&
        !active.sawReasoningDelta &&
        block.thinking
      ) {
        active.sawReasoningDelta = true;
        events.push(
          reasoningDelta(active.conversationId, active.turnId, block.thinking),
        );
      }
    }
    return events;
  }

  private startEngineTurn(
    conversationId: string,
    text: string,
    input: SendTextRequest["input"],
  ): { turnId: string } {
    const result = this.client.sendThreadEvent(conversationId, {
      input: [{ text, type: "text" }, ...(input ?? [])],
      type: "inputs",
    });
    if (!result.turnId) {
      throw new Error("Pi runtime turn did not produce an engine turn id.");
    }
    return { turnId: result.turnId };
  }

  private finishTurn(active: ActivePiTurn): TurnRunResult {
    const snapshot = this.requireConversation();
    const remoteThreadId =
      this.piSession?.sessionFile ??
      (snapshot.remoteKind === "known" ? snapshot.remoteId : undefined);
    if (remoteThreadId) {
      this.replayedSessionId = remoteThreadId;
    }

    return {
      conversation: snapshot,
      remoteThreadId,
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
      throw new Error("Pi runtime did not start a conversation.");
    }
    this.conversationId = result.conversationId;
    return this.requireConversation();
  }

  private startConversation(cwd: string | undefined): ClientCommandResult {
    if (!is.string(cwd) || cwd.length === 0) {
      throw new Error("Pi conversation cwd is required.");
    }
    return this.client.startThread({ cwd });
  }

  private async ensurePiSession(input: {
    cwd?: string;
    remoteId?: string;
  }): Promise<PiSdkAgentSession> {
    if (this.piSession) return this.piSession;

    const cwd = this.requireCwd(input.cwd);
    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage);
    const sessionManager = input.remoteId
      ? SessionManager.open(input.remoteId, undefined, cwd)
      : SessionManager.create(cwd);
    const { session } = await createAgentSession({
      authStorage,
      cwd,
      modelRegistry,
      sessionManager,
    });
    this.modelRegistry = modelRegistry;
    this.piSession = session;
    this.sessionCwd = cwd;
    this.currentModel = session.model;
    this.currentReasoningEffort = session.thinkingLevel;
    this.unsubscribe = session.subscribe((event) => {
      const active = this.activeTurn;
      if (!active) return;
      this.emitEngineEvents(
        this.eventsFromSdkEvent(event, active),
        active.request.onEvent,
      );
    });
    this.applyEngineEvents([
      this.conversationReadyEvent(
        this.requireConversation().id,
        cwd,
        session.sessionFile,
      ),
    ]);
    return session;
  }

  private async loadRuntimeConfiguration(cwd?: string): Promise<void> {
    if (this.runtimeConfigurationLoaded || !this.conversationId) return;
    const effectiveCwd = this.requireCwd(cwd);
    const authStorage = AuthStorage.create();
    const modelRegistry =
      this.modelRegistry ?? ModelRegistry.create(authStorage);
    this.modelRegistry = modelRegistry;
    this.modelInfos = modelRegistry.getAvailable();
    if (!this.currentModel && this.modelInfos[0]) {
      this.currentModel = this.modelInfos[0];
    }
    this.updateEffortsForModel(this.currentModel);

    const loader = new DefaultResourceLoader({
      agentDir: getAgentDir(),
      cwd: effectiveCwd,
      noExtensions: true,
    });
    await loader.reload();
    const commands = loader.getPrompts().prompts.map((prompt) => ({
      description: prompt.description,
      name: prompt.name,
    }));

    this.applyEngineEvents(
      compactEvents([
        availableCommandsUpdated(this.conversationId, commands),
        this.modelInfos.length > 0
          ? sessionModelsUpdated(
              this.conversationId,
              modelStateFromModels(this.modelInfos, this.currentModel),
            )
          : undefined,
        this.reasoningConfigUpdated(this.conversationId),
      ]),
    );
    this.runtimeConfigurationLoaded = true;
  }

  private async replayHistory(
    remoteId: string | undefined,
    conversationId: string,
  ): Promise<void> {
    if (!remoteId || this.replayedSessionId === remoteId || !this.piSession) {
      return;
    }
    const events = historyEventsFromSessionMessages(
      conversationId,
      this.piSession.messages,
    );
    if (events.length > 0) {
      this.applyEngineEvents(events);
    }
    this.replayedSessionId = remoteId;
  }

  private async applySelections(
    conversationId: string,
    request: SendTextRequest,
  ): Promise<void> {
    const events: EngineEventJson[] = [];
    if (request.model) {
      const model = await this.setPiModel(request.model);
      this.currentModel = model;
      this.updateEffortsForModel(model);
      events.push(
        sessionModelsUpdated(
          conversationId,
          modelStateFromModels(this.modelInfos, model),
        ),
      );
      events.push(
        contextUpdated(conversationId, [
          { Model: { model: request.model, scope: "TurnAndFuture" } },
        ]),
      );
    }
    if (request.reasoningEffort) {
      const level = piThinkingLevel(request.reasoningEffort);
      this.piSession?.setThinkingLevel(level);
      this.currentReasoningEffort = level;
      const reasoningEvent = this.reasoningConfigUpdated(conversationId);
      if (reasoningEvent) events.push(reasoningEvent);
      events.push(
        contextUpdated(conversationId, [
          {
            [EngineEventContextUpdateType.Reasoning]: {
              reasoning: { effort: level },
              scope: EngineEventContextScope.TurnAndFuture,
            },
          },
        ]),
      );
    }
    if (events.length > 0) {
      this.applyEngineEvents(events);
    }
  }

  private async setPiModel(modelId: string): Promise<PiModel> {
    const [provider, ...rest] = modelId.split("/");
    const id = rest.join("/");
    if (!is.nonEmptyString(provider) || !is.nonEmptyString(id)) {
      throw new Error(`Pi model id must be provider/model: ${modelId}`);
    }
    const model = this.modelRegistry?.find(provider, id);
    if (!model) {
      throw new Error(`Pi model not found: ${modelId}`);
    }
    await this.piSession?.setModel(model);
    return model;
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

  private updateEffortsForModel(model?: PiModel): void {
    const levels = piThinkingLevelIds.filter((level) => {
      if (level === "off") return true;
      if (!model?.reasoning) return false;
      return model.thinkingLevelMap?.[level] !== null;
    });
    this.availableEfforts = configValuesFromIds(levels);
    if (
      this.availableEfforts.length > 0 &&
      !this.availableEfforts.some(
        (effort) => effort.value === this.currentReasoningEffort,
      )
    ) {
      this.currentReasoningEffort = this.availableEfforts[0]
        .value as PiThinkingLevel;
    }
  }

  private conversationReadyEvent(
    conversationId: string,
    cwd: string,
    remoteId?: string,
  ): EngineEventJson {
    return {
      ConversationReady: {
        capabilities: null,
        context: contextPatch([
          {
            Cwd: {
              cwd,
              scope: "Conversation",
            },
          },
        ]),
        id: conversationId,
        remote: remoteId ? { Known: remoteId } : { Local: conversationId },
      },
    };
  }

  private emitTerminalIfNeeded(
    active: ActivePiTurn,
    outcome: `${EngineEventTurnOutcome}` | EngineEventJson,
  ): void {
    if (active.terminalEmitted) return;
    active.terminalEmitted = true;
    this.emitEngineEvents([
      turnTerminal(active.conversationId, active.turnId, outcome),
    ]);
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
      method: "pi/event",
      params: { events },
    });
  }

  private requireConversation(): ConversationSnapshot {
    const conversationId = this.conversationId;
    if (!conversationId) {
      throw new Error("Pi conversation has not been initialized.");
    }
    const conversation = this.client.threadState(conversationId);
    if (!conversation) {
      throw new Error("Pi conversation is missing from engine state.");
    }
    return conversation;
  }

  private requireCwd(cwd?: string): string {
    const resolved = cwd ?? this.sessionCwd;
    if (!is.string(resolved) || resolved.length === 0) {
      throw new Error("Pi conversation cwd is required.");
    }
    return resolved;
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

export function piTurnErrorOutcome(
  signal: AbortSignal | undefined,
  error: unknown,
): `${EngineEventTurnOutcome}` | EngineEventJson {
  if (signal?.aborted) return EngineEventTurnOutcome.Interrupted;
  return failedOutcome(errorMessage(error));
}

function piTurnOutcome(
  signal: AbortSignal | undefined,
  active: ActivePiTurn,
): `${EngineEventTurnOutcome}` | EngineEventJson {
  if (signal?.aborted) return EngineEventTurnOutcome.Interrupted;
  const stopReason = active.finalMessage?.stopReason;
  if (stopReason === "aborted") return EngineEventTurnOutcome.Interrupted;
  if (stopReason === "length") return EngineEventTurnOutcome.Exhausted;
  if (stopReason === "error") {
    return failedOutcome(
      active.finalMessage?.errorMessage ?? "Pi turn failed.",
    );
  }
  return EngineEventTurnOutcome.Succeeded;
}

function compactEvents(
  events: Array<EngineEventJson | undefined>,
): EngineEventJson[] {
  return events.filter(
    (event): event is EngineEventJson => event !== undefined,
  );
}
