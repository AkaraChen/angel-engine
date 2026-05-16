import type { SendTextRequest, TurnRunEvent } from "@angel-engine/client-napi";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatJsonValue } from "../types.js";

export type JsonObject = { [key: string]: ChatJsonValue };
export type ClaudeEngineEventJson = object;
export type ClaudeJsonObject = object;
export type EngineEventJson = object;
export type ClaudeSdkModule = typeof import("@anthropic-ai/claude-agent-sdk");

export interface ClaudeElicitationAnswer {
  id: string;
  value: string;
}

export type ClaudeElicitationResponse =
  | { type: "allow" }
  | { type: "allowForSession" }
  | { type: "deny" }
  | { type: "cancel" }
  | { answers: ClaudeElicitationAnswer[]; type: "answers" }
  | { success: boolean; type: "dynamicToolResult" }
  | { type: "externalComplete" }
  | { type: "raw"; value: string };

export type ClaudeCodeSendTextRequest = SendTextRequest & {
  input: NonNullable<SendTextRequest["input"]>;
  onEvent?: (event: TurnRunEvent) => void;
  onResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ClaudeElicitationResponse,
    ) => Promise<void>,
  ) => void;
  signal?: AbortSignal;
};

export interface SessionConfigValueJson {
  description: string | null;
  name: string;
  value: string;
}

export interface SessionPermissionModeJson {
  description: string | null;
  id: string;
  name: string;
}

export interface PendingPermission {
  reject: (error: Error) => void;
  resolve: (response: ClaudeElicitationResponse) => void;
  promise: Promise<ClaudeElicitationResponse>;
}

export interface ActiveClaudeTurn {
  actionIds: Set<string>;
  conversationId: string;
  finalResult?: SDKResultMessage;
  model?: string;
  request: ClaudeCodeSendTextRequest;
  sawReasoningDelta: boolean;
  sawTextDelta: boolean;
  sessionId?: string;
  turnId: string;
}
