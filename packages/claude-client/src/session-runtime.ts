import type {
  ClientCommandResult,
  ClientUpdate,
  ConversationSnapshot,
  SendTextRequest,
  TurnRunEvent,
} from "@angel-engine/client-napi";
import type {
  CanUseTool,
  ModelInfo,
  Options as ClaudeQueryOptions,
  Query,
  SDKControlInitializeResponse,
} from "@anthropic-ai/claude-agent-sdk";

import type {
  ActiveClaudeTurn,
  ClaudeElicitationResponse,
  EngineEventJson,
  SessionConfigValueJson,
  SessionPermissionModeJson,
} from "./types.js";
import {
  AngelEngineClient,
  ClientProtocol,
  EngineEventContextScope,
  EngineEventContextUpdateType,
  EngineEventType,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { emptyUpdate } from "@angel-engine/js-client/utils/client-update";
import { ClaudeCodeEngineAdapter } from "./adapter.js";
import { contextUpdated } from "./context.js";
import {
  availableCommandsUpdated,
  configValuesFromIds,
  modelInfoForId,
  modelStateFromModelInfo,
  permissionModeOptionsFromIds,
  sessionModelsUpdated,
  turnRunEventsFromUpdate,
} from "./events.js";
import { historyEventsFromSessionMessages } from "./history.js";
import {
  emptyClaudePrompt,
  loadClaudeEffortLevelIds,
  loadClaudePermissionModeIds,
  loadClaudeSdk,
} from "./runtime.js";
import { ClaudeSessionPermissions } from "./session-permissions.js";
import {
  claudePermissionModeIds,
  compactEvents,
  normalizeClaudeMode,
} from "./utils.js";

type NativeEngineClient = InstanceType<typeof AngelEngineClient>;

export class ClaudeCodeSessionRuntime {
  private readonly adapter = new ClaudeCodeEngineAdapter();
  private readonly client: NativeEngineClient;
  private readonly permissions = new ClaudeSessionPermissions();
  activeQuery?: Query;
  private availableEfforts: SessionConfigValueJson[] = [];
  currentPermissionMode = "default";
  private availablePermissionModes: SessionPermissionModeJson[] =
    permissionModeOptionsFromIds(
      claudePermissionModeIds(),
      this.currentPermissionMode,
    );
  private conversationId?: string;
  currentModel?: string;
  currentReasoningEffort = "high";
  modelInfos: ModelInfo[] = [];
  private operationQueue = Promise.resolve();
  private runtimeConfigurationLoaded = false;
  replayedSessionId?: string;
  private readonly spawnClaudeCodeProcess: ClaudeQueryOptions["spawnClaudeCodeProcess"];

  constructor(
    spawnClaudeCodeProcess?: ClaudeQueryOptions["spawnClaudeCodeProcess"],
  ) {
    this.spawnClaudeCodeProcess = spawnClaudeCodeProcess;
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
    this.permissions.close();
    this.activeQuery?.close();
    this.activeQuery = undefined;
  }

  hasConversation(): boolean {
    return Boolean(this.conversationId);
  }

  canUseTool(
    active: ActiveClaudeTurn,
    emitEngineEvents: (
      events: EngineEventJson[],
      onEvent?: (event: TurnRunEvent) => void,
    ) => void,
  ): CanUseTool {
    return this.permissions.canUseTool(active, emitEngineEvents);
  }

  resolveElicitation(
    elicitationId: string,
    response: ClaudeElicitationResponse,
  ): void {
    this.permissions.resolve(elicitationId, response);
  }

  startEngineTurn(
    conversationId: string,
    text: string,
    input: SendTextRequest["input"],
  ): { turnId: string } {
    const result = this.client.sendThreadEvent(conversationId, {
      input: [{ text, type: "text" }, ...(input ?? [])],
      type: "inputs",
    });
    if (!result.turnId) {
      throw new Error("Claude Code turn did not produce an engine turn id.");
    }
    return { turnId: result.turnId };
  }

  ensureConversation(input: {
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

  async loadRuntimeConfiguration(cwd?: string): Promise<void> {
    if (this.runtimeConfigurationLoaded || !this.conversationId) return;
    const sdk = await loadClaudeSdk();
    const query = sdk.query({
      prompt: emptyClaudePrompt(),
      options: {
        cwd,
        pathToClaudeCodeExecutable: claudeCodeExecutable(),
        permissionMode: normalizeClaudeMode(this.currentPermissionMode),
        spawnClaudeCodeProcess: this.spawnClaudeCodeProcess,
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

  async applyRuntimeConfiguration(
    conversationId: string,
    result: SDKControlInitializeResponse,
    currentModel?: string,
  ): Promise<void> {
    this.modelInfos = result.models;
    const modelState = modelStateFromModelInfo(result.models, currentModel);
    this.currentModel = modelState.current_model_id;
    const [modeIds, fallbackEffortLevels] = await Promise.all([
      loadClaudePermissionModeIds(),
      loadClaudeEffortLevelIds(),
    ]);
    this.availablePermissionModes = permissionModeOptionsFromIds(
      modeIds,
      this.currentPermissionMode,
    );
    this.updateEffortsForModel(this.currentModel, fallbackEffortLevels);

    this.applyEngineEvents(
      compactEvents([
        availableCommandsUpdated(conversationId, result.commands),
        sessionModelsUpdated(conversationId, modelState),
        this.sessionPermissionModesUpdated(conversationId),
        this.reasoningConfigUpdated(conversationId),
      ]),
    );
    this.runtimeConfigurationLoaded = true;
  }

  async replayHistory(remoteId?: string, cwd?: string): Promise<void> {
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

  applySelections(conversationId: string, request: SendTextRequest): void {
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

  sessionPermissionModesUpdated(conversationId: string): EngineEventJson {
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

  reasoningConfigUpdated(conversationId: string): EngineEventJson | undefined {
    if (this.availableEfforts.length === 0) return undefined;
    return {
      SessionConfigOptionsUpdated: {
        conversation_id: conversationId,
        options: [
          {
            category: "reasoning",
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

  updateEffortsForModel(
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

  emitEngineEvents(
    events: EngineEventJson[],
    onEvent?: (event: TurnRunEvent) => void,
  ): void {
    const update = this.applyEngineEvents(events);
    for (const event of turnRunEventsFromUpdate(update)) {
      onEvent?.(event);
    }
  }

  applyEngineEvents(events: EngineEventJson[]): ClientUpdate {
    if (events.length === 0) return emptyUpdate();
    return this.client.receiveJson({
      jsonrpc: "2.0",
      method: "claude/event",
      params: { events },
    });
  }

  requireConversation(): ConversationSnapshot {
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

  async enqueue<T>(action: () => Promise<T>): Promise<T> {
    const run = this.operationQueue.then(action);
    this.operationQueue = run.then(
      (): undefined => undefined,
      (): undefined => undefined,
    );
    return run;
  }

  private startConversation(cwd: string | undefined): ClientCommandResult {
    if (!is.string(cwd) || cwd.length === 0) {
      throw new Error("Claude Code conversation cwd is required.");
    }
    return this.client.startThread({ cwd });
  }

  private initialConversationEvents(conversationId: string): EngineEventJson[] {
    return compactEvents([this.reasoningConfigUpdated(conversationId)]);
  }
}

export function claudeCodeExecutable(): string {
  return process.env.CLAUDE_CODE_PATH ?? process.env.CLAUDE_PATH ?? "claude";
}
