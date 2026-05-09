import type { SendTextRequest } from "@angel-engine/client-napi";
import type { SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ChatElicitationResponse } from "../../../../shared/chat";
import type { ProjectedTurnEvent } from "../projection";

export type ClaudeSdkModule = typeof import("@anthropic-ai/claude-agent-sdk");

export type DesktopClaudeSendTextRequest = SendTextRequest & {
  onEvent?: (event: ProjectedTurnEvent) => void;
  onResolveElicitation?: (
    handler: (
      elicitationId: string,
      response: ChatElicitationResponse,
    ) => Promise<void>,
  ) => void;
  signal?: AbortSignal;
};

export type EngineEventJson = Record<string, unknown>;
export type JsonObject = Record<string, unknown>;

export type SessionConfigValueJson = {
  description: string | null;
  name: string;
  value: string;
};

export type SessionModeJson = {
  description: string | null;
  id: string;
  name: string;
};

export type PendingPermission = {
  reject: (error: Error) => void;
  resolve: (response: ChatElicitationResponse) => void;
  promise: Promise<ChatElicitationResponse>;
};

export type ActiveClaudeTurn = {
  actionIds: Set<string>;
  conversationId: string;
  finalResult?: SDKResultMessage;
  model?: string;
  request: DesktopClaudeSendTextRequest;
  sawReasoningDelta: boolean;
  sawTextDelta: boolean;
  sessionId?: string;
  turnId: string;
};
