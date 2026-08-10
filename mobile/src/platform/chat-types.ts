import type { AgentOption as ApiAgentOption } from "@angel-engine/daemon-api/agents";
import type {
  Chat as ApiChat,
  ChatActiveRunSnapshot as ApiChatActiveRunSnapshot,
  ChatActivity as ApiChatActivity,
  ChatActivityStatus as ApiChatActivityStatus,
  ChatCreateInput as ApiChatCreateInput,
  ChatCreationLocation as ApiChatCreationLocation,
  ChatElicitation as ApiChatElicitation,
  ChatElicitationAnswer as ApiChatElicitationAnswer,
  ChatElicitationQuestion as ApiChatElicitationQuestion,
  ChatElicitationResponse as ApiChatElicitationResponse,
  ChatHistoryMessage as ApiChatHistoryMessage,
  ChatHistoryMessagePart as ApiChatHistoryMessagePart,
  ChatLoadResult as ApiChatLoadResult,
  ChatPlanData as ApiChatPlanData,
  ChatPlanEntry as ApiChatPlanEntry,
  ChatRuntimeConfig as ApiChatRuntimeConfig,
  ChatRuntimeConfigInput as ApiChatRuntimeConfigInput,
  ChatRuntimeConfigOption as ApiChatRuntimeConfigOption,
  ChatRunObserverEvent as ApiChatRunObserverEvent,
  ChatRunStartInput as ApiChatRunStartInput,
  ChatSendInput as ApiChatSendInput,
  ChatSendResult as ApiChatSendResult,
  ChatStreamElicitationResolveInput as ApiChatStreamElicitationResolveInput,
  ChatStreamEvent as ApiChatStreamEvent,
  ChatToolAction as ApiChatToolAction,
  ChatToolActionPhase as ApiChatToolActionPhase,
} from "@angel-engine/daemon-api/chat";
import type { Project as ApiProject } from "@angel-engine/daemon-api/projects";

/** Raw daemon contracts consumed by the mobile HTTP/SSE client. */
export type DaemonChat = ApiChat;
export type DaemonProject = ApiProject;
export type DaemonAgentOption = Pick<
  ApiAgentOption,
  "description" | "id" | "label" | "readiness"
>;
export type ChatCreationLocation = ApiChatCreationLocation;
export type CreateChatInput = Pick<
  ApiChatCreateInput,
  | "creationLocation"
  | "model"
  | "projectId"
  | "reasoningEffort"
  | "runtime"
  | "title"
>;
export type DaemonRuntimeConfigInput = ApiChatRuntimeConfigInput;
export type DaemonRuntimeConfigOption = ApiChatRuntimeConfigOption;
export type DaemonRuntimeConfig = ApiChatRuntimeConfig;
export type DaemonToolAction = ApiChatToolAction;
export type DaemonMessagePart = ApiChatHistoryMessagePart;
export type DaemonToolCallPart = Extract<
  ApiChatHistoryMessagePart,
  { type: "tool-call" }
>;
export type DaemonPlanEntry = ApiChatPlanEntry;
export type DaemonPlanData = ApiChatPlanData;
export type DaemonHistoryMessage = ApiChatHistoryMessage;
export type ChatLoadResult = ApiChatLoadResult;
export type ChatSendInput = Required<
  Pick<ApiChatSendInput, "chatId" | "text">
> &
  Pick<ApiChatSendInput, "mode" | "permissionMode">;
export type ChatSendResult = ApiChatSendResult;
export type ChatActivity = ApiChatActivity;
export type ChatActivityStatus = ApiChatActivityStatus;
export type ChatActiveRunSnapshot = ApiChatActiveRunSnapshot;
export type ChatRunObserverEvent = ApiChatRunObserverEvent;
export type ChatRunStartInput = ApiChatRunStartInput;
export type DaemonElicitationQuestion = ApiChatElicitationQuestion;
export type DaemonElicitationKind = ApiChatElicitation["kind"];
export type DaemonElicitation = ApiChatElicitation;
export type ChatElicitationAnswer = ApiChatElicitationAnswer;
export type ChatElicitationResponse = ApiChatElicitationResponse;
export type ElicitationResolveInput = ApiChatStreamElicitationResolveInput;
export type ChatStreamEvent = ApiChatStreamEvent;

/**
 * Mobile chat-list row enriched with project/worktree labels derived from the
 * raw daemon chat contract.
 */
export type ChatSummary = Pick<
  ApiChat,
  "id" | "pinned" | "projectId" | "runtime" | "title" | "updatedAt"
> & {
  projectName: string | null;
  worktreeBranch: string | null;
};

/** Tool call fields rendered by the mobile transcript. */
export interface ConversationToolCall {
  /** Stable identity used for React keys and streamed action upserts. */
  id: string;
  /** Canonical tool identifier from the upstream action/history contract. */
  name: string;
  /** Human action label rendered beneath the identifier. */
  summary: string;
  /** Closed lifecycle phase derived from the upstream action contract. */
  phase: ApiChatToolActionPhase;
  argsText: string;
  outputText: string;
  errorText: string;
  isError: boolean;
}

export type ProjectedConversationToolCall = ConversationToolCall & {
  /** Canonical part retained for the optimistic history append. */
  historyPart: DaemonToolCallPart;
};

/** Restored image/file parts projected for mobile transcript tiles. */
export interface ConversationAttachment {
  /** Data URL or remote URL when available; omitted for name-only restore. */
  dataUrl?: string;
  id: string;
  mimeType?: string;
  name: string;
  type: "file" | "image";
}

/** Rendered conversation row derived from history plus live stream state. */
export interface ConversationMessage {
  id: string;
  role: ApiChatHistoryMessage["role"];
  text: string;
  reasoning: string;
  status: "complete" | "error" | "streaming";
  error?: string;
  toolCalls: ConversationToolCall[];
  plans: ApiChatPlanData[];
  /**
   * Canonical timestamp when the history/source provided one. Never fabricated
   * with `new Date()` — omit the visual time when missing.
   */
  createdAt?: string;
  attachments: ConversationAttachment[];
}
