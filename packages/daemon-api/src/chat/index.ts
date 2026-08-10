import type {
  Chat as JsChat,
  ChatAgentState as JsChatAgentState,
  ChatAttachmentInput as JsChatAttachmentInput,
  ChatCreateInput as JsChatCreateInput,
  ChatElicitation as JsChatElicitation,
  ChatElicitationQuestion as JsChatElicitationQuestion,
  ChatElicitationQuestionOption as JsChatElicitationQuestionOption,
  ChatHistoryMessage as JsChatHistoryMessage,
  ChatHistoryMessagePart as JsChatHistoryMessagePart,
  ChatJsonObject as JsChatJsonObject,
  ChatJsonValue as JsChatJsonValue,
  ChatLoadResult as JsChatLoadResult,
  ChatPlanData as JsChatPlanData,
  ChatPlanEntry as JsChatPlanEntry,
  ChatPlanEntryStatus as JsChatPlanEntryStatus,
  ChatRuntimeConfigInput as JsChatRuntimeConfigInput,
  ChatRuntimeConfigOption as JsChatRuntimeConfigOption,
  ChatSendInput as JsChatSendInput,
  ChatSessionUsage as JsChatSessionUsage,
  ChatToolAction as JsChatToolAction,
  ChatToolActionError as JsChatToolActionError,
  ChatToolActionOutput as JsChatToolActionOutput,
  ChatToolActionPhase as JsChatToolActionPhase,
  ChatToolCallPart as JsChatToolCallPart,
} from "@angel-engine/js-client";
import { type as arkType } from "arktype";
import { normalizeChatAttachmentsInput } from "@angel-engine/js-client/utils/attachments";
import {
  cloneChatElicitation as cloneJsChatElicitation,
  isChatElicitationData as isJsChatElicitationData,
  upsertChatElicitationPart as upsertJsChatElicitationPart,
} from "@angel-engine/js-client/utils/elicitations";
import {
  imageDataUrl,
  parseDataUrl,
  parseImageDataUrl,
} from "@angel-engine/js-client/utils/media";
import {
  appendChatTextPart as appendJsChatTextPart,
  cloneChatHistoryPart as cloneJsChatHistoryPart,
  chatPartsText as jsChatPartsText,
} from "@angel-engine/js-client/utils/messages";
import {
  cloneChatPlanData as cloneJsChatPlanData,
  isChatPlanData as isJsChatPlanData,
  isChatPlanPart as isJsChatPlanPart,
  chatPlanPartName as jsChatPlanPartName,
  normalizeChatPlanMessages as normalizeJsChatPlanMessages,
  upsertChatPlanPart as upsertJsChatPlanPart,
} from "@angel-engine/js-client/utils/plans";
import {
  isChatToolAction as isJsChatToolAction,
  isTerminalChatToolPhase,
  chatToolActionToPart as jsChatToolActionToPart,
} from "@angel-engine/js-client/utils/tools";

export {
  imageDataUrl,
  isTerminalChatToolPhase,
  parseDataUrl,
  parseImageDataUrl,
};
export { isChatActivity, isChatActivityListResult } from "./activity";
export {
  isChatAttention,
  isChatAttentionListResult,
  isChatAttentionReadInput,
  isChatAttentionReadResult,
} from "./attention";
export {
  isChatAmbiguousRunResult,
  isChatActiveRunResult,
  isChatActiveRunSnapshot,
  isChatElicitationResponse,
  isChatRunObserverEvent,
  isChatRunStartInput,
} from "./active-run";
export { isChatStreamEvent } from "./stream-event";

export type ChatCreationLocation = "project" | "worktree";
export interface ChatCreationLocationInput {
  creationLocation?: ChatCreationLocation;
}
export interface ChatCwdInput {
  cwd?: string;
}
/**
 * Claims a prewarmed session for the chat being created. Prewarm is a chat
 * creation optimization, so it belongs here and never on run start input.
 */
export interface ChatPrewarmIdInput {
  prewarmId?: string;
}
export interface WorktreeSetupApprovalInput {
  worktreeSetupApproval?: string;
}

export type WorktreeCreationStage = "fetching" | "worktree" | "setup";
export type WorktreeCreationStatus = "creating" | "failed";

export interface WorktreeCreationState {
  error?: string;
  jobId: string;
  progress: number;
  stage: WorktreeCreationStage;
  status: WorktreeCreationStatus;
}

export type Chat = JsChat & {
  /** Present while an app-managed worktree is being created or needs retry. */
  worktreeCreation?: WorktreeCreationState;
};
export type ChatCreateInput = JsChatCreateInput &
  ChatCreationLocationInput &
  ChatCwdInput &
  ChatPrewarmIdInput &
  WorktreeSetupApprovalInput & {
    remoteThreadId?: string;
  };

/** A remote provider session that can be imported into Angel Engine. */
export interface ImportableSession {
  cwd?: string | null;
  remoteId: string;
  title?: string | null;
  updatedAt?: string | null;
}

export interface ListImportableSessionsInput {
  cursor?: string;
  cwd?: string;
  projectId?: string;
  runtime: string;
}

export interface ListImportableSessionsResult {
  nextCursor?: string | null;
  sessions: ImportableSession[];
  unsupportedReason?: string | null;
}

export interface ImportChatInput {
  cwd?: string;
  projectId?: string;
  remoteThreadId: string;
  runtime: string;
  title?: string;
}

export type ImportChatResult = ChatLoadResult;
export type ChatRuntimeConfigInput = JsChatRuntimeConfigInput;
export type ChatRuntimeConfigOption = JsChatRuntimeConfigOption;
export type ChatSessionUsage = JsChatSessionUsage;
export type ChatAgentState = JsChatAgentState;
export type ChatHistoryMessage = Omit<JsChatHistoryMessage, "content"> & {
  content: ChatHistoryMessagePart[];
};
export type ChatJsonValue = JsChatJsonValue;
export type ChatJsonObject = JsChatJsonObject;
export type ChatPlanEntryStatus = JsChatPlanEntryStatus;
export type ChatPlanEntry = JsChatPlanEntry;
export type ChatPlanData = JsChatPlanData;
export type ChatPlanPartName = "plan" | "todo";
export type ChatToolActionOutput = JsChatToolActionOutput;
export type ChatToolActionError = JsChatToolActionError;
export type ChatToolActionPhase = JsChatToolActionPhase;
export type ChatElicitationQuestionOption = JsChatElicitationQuestionOption;
export type ChatElicitationQuestion = JsChatElicitationQuestion;
export type ChatElicitation = JsChatElicitation;
export type ChatAttachmentInput = JsChatAttachmentInput;
export type ChatSendInput = JsChatSendInput &
  ChatCreationLocationInput &
  ChatCwdInput &
  WorktreeSetupApprovalInput;
export type ChatStreamPart = "reasoning" | "text";

export interface ChatAvailableCommand {
  description: string;
  inputHint?: string | null;
  name: string;
}

export interface ChatAvailableSkill {
  description: string;
  enabled: boolean;
  name: string;
  path: string;
  scope: "admin" | "repo" | "system" | "user";
}

export interface ChatRuntimeConfig {
  agentState?: ChatAgentState;
  availableCommands?: ChatAvailableCommand[];
  canSetMode?: boolean;
  canSetModel?: boolean;
  canSetPermissionMode?: boolean;
  canSetReasoningEffort?: boolean;
  currentMode?: string | null;
  currentModel?: string | null;
  currentPermissionMode?: string | null;
  currentReasoningEffort?: string | null;
  modes: ChatRuntimeConfigOption[];
  models: ChatRuntimeConfigOption[];
  permissionModes: ChatRuntimeConfigOption[];
  reasoningEfforts: ChatRuntimeConfigOption[];
  usage?: ChatSessionUsage;
}

export type ChatToolAction = JsChatToolAction;
export type ChatToolCallPart = JsChatToolCallPart;

export interface ChatErrorData {
  message: string;
  source: "runtime";
  type: "chat-error";
}

export type ChatHistoryMessagePart =
  | Extract<
      JsChatHistoryMessagePart,
      { type: "file" | "image" | "reasoning" | "text" }
    >
  | {
      data: ChatPlanData;
      name: ChatPlanPartName;
      type: "data";
    }
  | {
      data: ChatElicitation;
      name: "elicitation";
      type: "data";
    }
  | {
      data: ChatErrorData;
      name: "chat-error";
      type: "data";
    }
  | ChatToolCallPart;

export type ChatLoadResult = Omit<JsChatLoadResult, "config" | "messages"> & {
  config?: ChatRuntimeConfig;
  messages: ChatHistoryMessage[];
};

export interface ChatElicitationAnswer {
  id: string;
  value: string;
}

export type ChatElicitationResponse =
  | { type: "allow" }
  | { type: "allowForSession" }
  | { type: "deny" }
  | { type: "cancel" }
  | { answers: ChatElicitationAnswer[]; type: "answers" }
  | { success: boolean; type: "dynamicToolResult" }
  | { type: "externalComplete" }
  | { type: "raw"; value: string };

export interface ChatSendResult {
  chat: Chat;
  chatId: string;
  config?: ChatRuntimeConfig;
  content: ChatHistoryMessagePart[];
  model?: string;
  reasoning?: string;
  text: string;
  turnId?: string;
}

export interface ChatStreamDelta {
  part: ChatStreamPart;
  text: string;
  turnId?: string;
  type: "delta";
}

export type ChatStreamEvent =
  | { chat: Chat; type: "chat" }
  | ChatStreamDelta
  | { plan: ChatPlanData; turnId?: string; type: "plan" }
  | { elicitation: ChatElicitation; type: "elicitation" }
  | { action: ChatToolAction; type: "tool" }
  | { action: ChatToolAction; type: "toolDelta" }
  | { result: ChatSendResult; type: "result" }
  | { message: string; type: "error" }
  | { type: "done" };

interface ChatActivityBase {
  chatId: string;
  runId: string;
  updatedAt: string;
}

export type ChatActivityStatus =
  | "running"
  | "waiting_for_you"
  | "stuck"
  | "done"
  | "failed";

export type ChatActivityReason =
  | "approval"
  | "question"
  | "process_exited"
  | "runtime_error";

export type ChatActivity =
  | (ChatActivityBase & {
      status: "running";
    })
  | (ChatActivityBase & {
      attentionId: string;
      reason: "approval" | "question";
      status: "waiting_for_you";
    })
  | (ChatActivityBase & {
      reason: "process_exited";
      status: "stuck";
    })
  | (ChatActivityBase & {
      attentionId: string;
      status: "done";
    })
  | (ChatActivityBase & {
      attentionId: string;
      failure: { message: string };
      reason: "runtime_error";
      status: "failed";
    });

export interface ChatActivityListResult {
  items: ChatActivity[];
}

export interface ChatAttention {
  chatId: string;
  id: string;
  status: "completed" | "failed" | "needsInput";
  updatedAt: string;
}

export interface ChatAttentionListResult {
  attentions: ChatAttention[];
}

export interface ChatAttentionReadInput {
  attentionId: string;
}

export interface ChatAttentionReadResult {
  read: boolean;
}

export type ChatRunStartInput = Pick<
  ChatSendInput,
  | "attachments"
  | "mode"
  | "model"
  | "origin"
  | "permissionMode"
  | "reasoningEffort"
  | "text"
> & {
  chatId: string;
};

interface ChatActiveRunBase {
  assistantMessage: ChatHistoryMessage;
  chatId: string;
  lastEventSequence: number;
  runId: string;
  startedAt: string;
  updatedAt: string;
  userMessage: ChatHistoryMessage;
}

export type ChatOpenElicitation = ChatElicitation & { phase: "open" };

export type ChatActiveRunSnapshot =
  | (ChatActiveRunBase & {
      pendingElicitation: null;
      status: "running";
    })
  | (ChatActiveRunBase & {
      pendingElicitation: ChatOpenElicitation;
      status: "needsInput";
    });

export interface ChatActiveRunResult {
  run: ChatActiveRunSnapshot | null;
}

export interface ChatAmbiguousRunSnapshot {
  chatId: string;
  createdAt: string;
  runId: string;
  status: "dispatching";
}

export interface ChatAmbiguousRunResult {
  run: ChatAmbiguousRunSnapshot | null;
}

export type ChatRunObserverEvent =
  | { snapshot: ChatActiveRunSnapshot; type: "snapshot" }
  | { event: ChatStreamEvent; sequence: number; type: "event" };

export interface ChatPrewarmInput {
  creationLocation?: ChatCreationLocation;
  projectId?: string;
  runtime?: string;
}

export interface ChatRenameInput {
  chatId: string;
  title: string;
}

export interface ChatSetModeInput {
  chatId: string;
  mode: string;
}

export interface ChatSetPermissionModeInput {
  chatId: string;
  mode: string;
}

export interface ChatSetRuntimeInput {
  chatId: string;
  runtime: string;
}

export interface ChatPrewarmResult {
  config?: ChatRuntimeConfig;
  prewarmId: string;
}

export interface ChatIdsInput {
  chatIds: string[];
}

export type ChatArchivedRestoreInput = ChatIdsInput;
export type ChatArchivedDeleteInput = ChatIdsInput;
export type ChatArchivedDeleteImpactInput = ChatIdsInput;

export interface ChatArchivedDeleteImpact {
  chatCount: number;
  managedWorktreeCount: number;
  managedWorktrees: string[];
}

export interface ChatArchivedDeleteResult {
  deletedCount: number;
  deletedWorktreeCount: number;
  deletedWorktrees: string[];
}

export interface ChatSetModeResult {
  chat: Chat;
  config: ChatRuntimeConfig;
}

export interface ChatSetPermissionModeResult {
  chat: Chat;
  config: ChatRuntimeConfig;
}

export interface ProjectFileSearchInput {
  limit?: number;
  query: string;
  root: string;
}

export interface ProjectFileSearchResult {
  mimeType: string | null;
  name: string;
  path: string;
  relativePath: string;
  type: "directory" | "file";
}

export interface ChatStreamElicitationResolveInput {
  elicitationId: string;
  response: ChatElicitationResponse;
}

export function chatToolActionToPart(action: ChatToolAction): ChatToolCallPart {
  return jsChatToolActionToPart(action);
}

export function isChatToolAction(value: unknown): value is ChatToolAction {
  return isJsChatToolAction(value);
}

export function appendChatTextPart(
  parts: ChatHistoryMessagePart[],
  type: "reasoning" | "text",
  text: string,
): void {
  appendJsChatTextPart(parts as JsChatHistoryMessagePart[], type, text);
}

export function cloneChatHistoryPart(
  part: ChatHistoryMessagePart,
): ChatHistoryMessagePart {
  if (part.type === "data" && isChatErrorData(part.data)) {
    return {
      data: { ...part.data },
      name: "chat-error",
      type: "data",
    };
  }
  return cloneJsChatHistoryPart(part as JsChatHistoryMessagePart);
}

export function chatPartsText(
  parts: ChatHistoryMessagePart[],
  type: "reasoning" | "text",
): string {
  return jsChatPartsText(parts as JsChatHistoryMessagePart[], type);
}

export function isChatPlanData(value: unknown): value is ChatPlanData {
  return isJsChatPlanData(value);
}

export function isChatElicitationData(
  value: unknown,
): value is ChatElicitation {
  return isJsChatElicitationData(value);
}

export function isChatErrorData(value: unknown): value is ChatErrorData {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    (value as ChatErrorData).type === "chat-error" &&
    typeof (value as ChatErrorData).message === "string"
  );
}

export function cloneChatPlanData(data: ChatPlanData): ChatPlanData {
  return cloneJsChatPlanData(data);
}

export function normalizeChatPlanMessages(
  messages: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  return normalizeJsChatPlanMessages(messages as JsChatHistoryMessage[]);
}

export function cloneChatElicitation(data: ChatElicitation): ChatElicitation {
  return cloneJsChatElicitation(data);
}

export function upsertChatPlanPart(
  parts: ChatHistoryMessagePart[],
  plan: ChatPlanData,
): void {
  upsertJsChatPlanPart(parts as JsChatHistoryMessagePart[], plan);
}

export function chatPlanPartName(plan: ChatPlanData): ChatPlanPartName {
  return jsChatPlanPartName(plan);
}

export function isChatPlanPart(part: ChatHistoryMessagePart): part is Extract<
  ChatHistoryMessagePart,
  { type: "data" }
> & {
  data: ChatPlanData;
  name: ChatPlanPartName;
} {
  return isJsChatPlanPart(part as JsChatHistoryMessagePart);
}

export function upsertChatElicitationPart(
  parts: ChatHistoryMessagePart[],
  elicitation: ChatElicitation,
): void {
  upsertJsChatElicitationPart(parts as JsChatHistoryMessagePart[], elicitation);
}

export { normalizeChatAttachmentsInput };

const chatId = arkType("string > 0");

export const chatCreateInputSchema = arkType({
  "+": "ignore",
  "creationLocation?": "'project' | 'worktree' | undefined",
  "cwd?": "string > 0 | undefined",
  "model?": "string > 0 | undefined",
  "mode?": "string > 0 | undefined",
  "permissionMode?": "string > 0 | undefined",
  "prewarmId?": "string > 0 | undefined",
  "projectId?": "string > 0 | undefined",
  "reasoningEffort?": "string > 0 | undefined",
  "remoteThreadId?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
  "title?": "string > 0 | undefined",
  "worktreeSetupApproval?": "string > 0 | undefined",
});

export const listImportableSessionsInputSchema = arkType({
  "+": "ignore",
  "cursor?": "string > 0 | undefined",
  "cwd?": "string > 0 | undefined",
  "projectId?": "string > 0 | undefined",
  runtime: "string > 0",
});

export const importChatInputSchema = arkType({
  "+": "ignore",
  "cwd?": "string > 0 | undefined",
  "projectId?": "string > 0 | undefined",
  remoteThreadId: "string > 0",
  runtime: "string > 0",
  "title?": "string > 0 | undefined",
});

export const chatPrewarmInputSchema = arkType({
  "+": "ignore",
  "creationLocation?": "'project' | 'worktree' | undefined",
  "projectId?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
});

export const chatRenameInputSchema = arkType({
  "+": "ignore",
  chatId: "string > 0",
  title: "string > 0",
});

export const chatIdsInputSchema = arkType({
  "+": "ignore",
  chatIds: chatId.array(),
});

export const chatRuntimeConfigInputSchema = arkType({
  "+": "ignore",
  "cwd?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
});

export const chatSendInputSchema = arkType({
  "+": "ignore",
  "attachments?": "unknown | undefined",
  "chatId?": "string > 0 | undefined",
  "creationLocation?": "'project' | 'worktree' | undefined",
  "cwd?": "string > 0 | undefined",
  "model?": "string > 0 | undefined",
  "mode?": "string > 0 | undefined",
  "origin?": "'shepherd' | undefined",
  "permissionMode?": "string > 0 | undefined",
  "prewarmId?": "string > 0 | undefined",
  "projectId?": "string > 0 | undefined",
  "reasoningEffort?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
  text: "string",
  "worktreeSetupApproval?": "string > 0 | undefined",
});

export const chatSetModeInputSchema = arkType({
  "+": "ignore",
  chatId: "string > 0",
  mode: "string > 0",
});

export const chatSetPermissionModeInputSchema = arkType({
  "+": "ignore",
  chatId: "string > 0",
  mode: "string > 0",
});

export const chatSetRuntimeInputSchema = arkType({
  "+": "ignore",
  chatId: "string > 0",
  runtime: "string > 0",
});
