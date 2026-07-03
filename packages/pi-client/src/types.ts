import type { SendTextRequest, TurnRunEvent } from "@angel-engine/client-napi";

export type EngineEventJson = object;
export type PiJsonObject = object;
export type PiSdkModule = typeof import("@earendil-works/pi-coding-agent");
export type PiAgentSession = Awaited<
  ReturnType<PiSdkModule["createAgentSession"]>
>["session"];
export type PiAgentSessionEvent = Parameters<
  PiAgentSession["subscribe"]
>[0] extends (event: infer Event) => void
  ? Event
  : never;
export type PiAgentMessage = PiAgentSession["messages"][number];
export type PiModel = NonNullable<PiAgentSession["model"]>;
export type PiModelRegistry = ReturnType<
  PiSdkModule["ModelRegistry"]["create"]
>;
export type PiThinkingLevel = Parameters<PiAgentSession["setThinkingLevel"]>[0];

export type PiSendTextRequest = SendTextRequest & {
  input?: NonNullable<SendTextRequest["input"]>;
  onEvent?: (event: TurnRunEvent) => void;
  signal?: AbortSignal;
};

export interface SessionConfigValueJson {
  description: string | null;
  name: string;
  value: string;
}

export interface PiModelStateJson {
  available_models: Array<{
    description: string;
    id: string;
    name: string;
  }>;
  current_model_id: string;
}

export interface ActivePiTurn {
  actionIds: Set<string>;
  conversationId: string;
  finalMessage?: Extract<PiAgentMessage, { role: "assistant" }>;
  request: PiSendTextRequest;
  sawReasoningDelta: boolean;
  sawTextDelta: boolean;
  terminalEmitted: boolean;
  turnId: string;
}
