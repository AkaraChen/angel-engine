export {
  AngelClient,
  AngelEngineClient,
  answersResponse,
  normalizeClientOptions,
  textThreadEvent,
} from '@angel-engine/client-napi';

export type {
  ActionSnapshot,
  ClientCommandResult,
  ClientOptions,
  ClientUpdate,
  ConversationSnapshot,
  ElicitationResponse,
} from '@angel-engine/client-napi';

import type {
  ActionSnapshot,
  ClientOptions,
  ConversationSnapshot,
  ElicitationResponse,
} from '@angel-engine/client-napi';

export type AgentRuntime = 'codex' | 'kimi' | 'opencode';

export type RuntimeOptionsOverrides = Partial<ClientOptions> & {
  clientName?: string;
  clientTitle?: string;
  defaultReasoningEffort?: string;
};

export type RuntimeConfigOption = {
  description?: string | null;
  label: string;
  value: string;
};

export type RuntimeConfig = {
  canSetReasoningEffort?: boolean;
  currentMode?: string | null;
  currentModel?: string | null;
  currentReasoningEffort?: string | null;
  modes: RuntimeConfigOption[];
  models: RuntimeConfigOption[];
  reasoningEfforts: RuntimeConfigOption[];
};

export type ToolCallPart = {
  args: Record<string, unknown>;
  argsText: string;
  artifact: ActionSnapshot;
  isError?: boolean;
  result?: unknown;
  toolCallId: string;
  toolName: string;
  type: 'tool-call';
};

export type HistoryMessagePart =
  | {
      text: string;
      type: 'reasoning' | 'text';
    }
  | ToolCallPart;

export type HistoryMessage = {
  content: HistoryMessagePart[];
  createdAt?: string;
  id: string;
  role: 'assistant' | 'system' | 'user';
};

export type RuntimeOptions = ClientOptions & {
  defaultReasoningEffort?: string;
  runtime: AgentRuntime;
};

export type RunTurnEvent =
  | {
      part: 'reasoning' | 'text';
      text: string;
      turnId?: string;
      type: 'delta';
    }
  | {
      action: ActionSnapshot;
      type: 'tool';
    }
  | {
      result: RunTurnResult;
      type: 'result';
    }
  | {
      message: string;
      type: 'error';
    }
  | {
      type: 'done';
    };

export type RunTurnResult = {
  config?: RuntimeConfig;
  content: HistoryMessagePart[];
  model?: string;
  reasoning?: string;
  remoteThreadId?: string;
  text: string;
  turnId?: string;
};

export type RunTextRequest = {
  cwd?: string;
  model?: string | null;
  mode?: string | null;
  onEvent?: (event: Extract<RunTurnEvent, { type: 'delta' | 'tool' }>) => void;
  onResolveElicitation?: (
    handler: (elicitationId: string, response: ElicitationResponse) => Promise<void>,
  ) => void;
  reasoningEffort?: string | null;
  remoteId?: string | null;
  signal?: AbortSignal;
  text: string;
};

export declare class AngelSession {
  constructor(options?: RuntimeOptions | AgentRuntime | string);
  sendText(request: RunTextRequest): Promise<RunTurnResult>;
  runText(request: RunTextRequest): AsyncGenerator<RunTurnEvent, void, unknown>;
  hydrate(request?: { cwd?: string; remoteId?: string | null }): Promise<ConversationSnapshot>;
  inspect(cwd?: string): Promise<RuntimeConfig>;
  hasConversation(): boolean;
  close(): void;
}

export declare function createRuntimeOptions(
  runtimeName?: string | null,
  overrides?: RuntimeOptionsOverrides,
): RuntimeOptions;
export declare function normalizeRuntimeName(runtime?: string | null): AgentRuntime;
export declare function conversationMessages(
  snapshot: ConversationSnapshot,
): HistoryMessage[];
export declare function runtimeConfigFromConversationSnapshot(
  snapshot: ConversationSnapshot,
): RuntimeConfig;
export declare function toolActionToPart(action: ActionSnapshot): HistoryMessagePart;
export declare function cloneHistoryPart(part: HistoryMessagePart): HistoryMessagePart;
export declare function appendTextPart(
  parts: HistoryMessagePart[],
  type: 'reasoning' | 'text',
  text: string,
): void;
export declare function partsText(
  parts: HistoryMessagePart[],
  type: 'reasoning' | 'text',
): string;
export declare function isTerminalToolPhase(phase?: string): boolean;
