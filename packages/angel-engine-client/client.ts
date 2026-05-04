export {
  AngelClient,
  AngelEngineClient,
  answersResponse,
  normalizeClientOptions,
  textThreadEvent,
} from '../../crates/angel-engine-client-napi';

export type {
  ActionOutputSnapshot,
  ActionSnapshot,
  ClientCommandResult,
  ClientOptions,
  ClientUpdate,
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
  DisplayMessageSnapshot,
  DisplayToolActionSnapshot,
  ElicitationResponse,
  ElicitationSnapshot,
  HydrateRequest,
  InspectRequest,
  RuntimeOptions,
  RuntimeOptionsOverrides,
  SendTextRequest,
  TurnSnapshot,
  TurnRunEvent,
  TurnRunResult,
} from '../../crates/angel-engine-client-napi';

import type {
  ActionOutputSnapshot,
  ActionSnapshot,
  ConversationSnapshot,
  DisplayMessagePartSnapshot,
  ElicitationResponse,
  ElicitationSnapshot,
  HydrateRequest,
  InspectRequest,
  RuntimeOptions,
  RuntimeOptionsOverrides,
  SendTextRequest,
  TurnRunResult,
} from '../../crates/angel-engine-client-napi';

export type AgentRuntime = RuntimeOptions['runtime'];
export type RunTurnResult = TurnRunResult;

export type RunTurnStreamEvent =
  | {
      part: 'reasoning' | 'text';
      text: string;
      turnId?: string;
      messagePart?: DisplayMessagePartSnapshot;
      type: 'delta';
    }
  | {
      action: ActionSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      type: 'actionObserved';
    }
  | {
      action: ActionSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      type: 'actionUpdated';
    }
  | {
      actionId: string;
      content: ActionOutputSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      turnId: string;
      type: 'actionOutputDelta';
    }
  | {
      elicitation: ElicitationSnapshot;
      messagePart?: DisplayMessagePartSnapshot;
      type: 'elicitation';
    };

export type RunTurnEvent =
  | RunTurnStreamEvent
  | {
      result: TurnRunResult;
      type: 'result';
    }
  | {
      message: string;
      type: 'error';
    }
  | {
      type: 'done';
    };

export type RunTextRequest = SendTextRequest & {
  onEvent?: (event: RunTurnStreamEvent) => void;
  onResolveElicitation?: (
    handler: (elicitationId: string, response: ElicitationResponse) => Promise<void>,
  ) => void;
  signal?: AbortSignal;
};

export declare class AngelSession {
  constructor(options?: RuntimeOptions | AgentRuntime | string);
  sendText(request: RunTextRequest): Promise<TurnRunResult>;
  runText(request: RunTextRequest): AsyncGenerator<RunTurnEvent, void, unknown>;
  hydrate(request?: HydrateRequest): Promise<ConversationSnapshot>;
  inspect(cwd?: string | InspectRequest): Promise<ConversationSnapshot>;
  hasConversation(): boolean;
  close(): void;
}

export declare function createRuntimeOptions(
  runtimeName?: string | null,
  overrides?: RuntimeOptionsOverrides,
): RuntimeOptions;
export declare function normalizeRuntimeName(runtime?: string | null): AgentRuntime;
