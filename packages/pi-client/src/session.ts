import type {
  ConversationSnapshot,
  HydrateRequest,
  InspectRequest,
  SendTextRequest,
  SetModeRequest,
  SetPermissionModeRequest,
  TurnRunResult,
} from "@angel-engine/client-napi";
import type {
  ActivePiTurn,
  EngineEventJson,
  PiAgentSession as PiSdkAgentSession,
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
  EngineEventContextScope,
  EngineEventContextUpdateType,
  EngineEventTurnOutcome,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import {
  errorMessage,
  throwIfAborted,
} from "@angel-engine/js-client/utils/errors";
import { PiEngineAdapter } from "./adapter.js";
import { contextUpdated } from "./context.js";
import {
  availableCommandsUpdated,
  failedOutcome,
  modelStateFromModels,
  sessionModelsUpdated,
  turnTerminal,
} from "./events.js";
import { historyEventsFromSessionMessages } from "./history.js";
import { piPrompt, piThinkingLevel } from "./runtime.js";
import {
  applyEngineEvents,
  emitEngineEvents,
  startConversation,
  startEngineTurn,
} from "./session-engine.js";
import {
  compactEvents,
  conversationReadyEvent,
  reasoningConfigUpdated,
  reasoningEffortState,
} from "./session-state.js";
import { eventsFromSdkEvent, piTurnOutcome } from "./session-stream.js";

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

  processId(): undefined {
    // The pinned Pi SDK runs in-process and exposes no child process pid.
    return undefined;
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

    const turn = startEngineTurn(this.client, conversation.id, text, input);
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
      : startConversation(this.client, input.cwd);
    if (!result.conversationId) {
      throw new Error("Pi runtime did not start a conversation.");
    }
    this.conversationId = result.conversationId;
    return this.requireConversation();
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
      emitEngineEvents(
        this.client,
        eventsFromSdkEvent(event, active, this.currentModel),
        active.request.onEvent,
      );
    });
    applyEngineEvents(this.client, [
      conversationReadyEvent(
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

    applyEngineEvents(
      this.client,
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
    if (events.length > 0) applyEngineEvents(this.client, events);
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
    if (events.length > 0) applyEngineEvents(this.client, events);
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
    return reasoningConfigUpdated(
      conversationId,
      this.availableEfforts,
      this.currentReasoningEffort,
    );
  }

  private updateEffortsForModel(model?: PiModel): void {
    const state = reasoningEffortState(model, this.currentReasoningEffort);
    this.availableEfforts = state.availableEfforts;
    this.currentReasoningEffort = state.currentReasoningEffort;
  }

  private emitTerminalIfNeeded(
    active: ActivePiTurn,
    outcome: `${EngineEventTurnOutcome}` | EngineEventJson,
  ): void {
    if (active.terminalEmitted) return;
    active.terminalEmitted = true;
    emitEngineEvents(this.client, [
      turnTerminal(active.conversationId, active.turnId, outcome),
    ]);
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
