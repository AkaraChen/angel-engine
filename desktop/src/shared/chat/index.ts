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
  ChatToolAction as JsChatToolAction,
  ChatToolActionError as JsChatToolActionError,
  ChatToolActionOutput as JsChatToolActionOutput,
  ChatToolActionPhase as JsChatToolActionPhase,
  ChatToolCallPart as JsChatToolCallPart,
} from "@angel-engine/js-client";
import {
  chatPartsText as jsChatPartsText,
  cloneChatHistoryPart as cloneJsChatHistoryPart,
  appendChatTextPart as appendJsChatTextPart,
} from "@angel-engine/js-client/utils/messages";
import {
  chatPlanPartName as jsChatPlanPartName,
  cloneChatPlanData as cloneJsChatPlanData,
  isChatPlanData as isJsChatPlanData,
  isChatPlanPart as isJsChatPlanPart,
  normalizeChatPlanMessages as normalizeJsChatPlanMessages,
  upsertChatPlanPart as upsertJsChatPlanPart,
} from "@angel-engine/js-client/utils/plans";
import {
  chatToolActionToPart as jsChatToolActionToPart,
  isChatToolAction as isJsChatToolAction,
  isTerminalChatToolPhase,
} from "@angel-engine/js-client/utils/tools";
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
import { normalizeChatAttachmentsInput } from "@angel-engine/js-client/utils/attachments";

export {
  imageDataUrl,
  isTerminalChatToolPhase,
  parseDataUrl,
  parseImageDataUrl,
};

export type Chat = JsChat;
export type ChatCreateInput = JsChatCreateInput;
export type ChatRuntimeConfigInput = JsChatRuntimeConfigInput;
export type ChatRuntimeConfigOption = JsChatRuntimeConfigOption;
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
export type ChatSendInput = JsChatSendInput;
export type ChatStreamPart = "reasoning" | "text";

export interface ChatAvailableCommand {
  description: string;
  inputHint?: string | null;
  name: string;
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
}

export type ChatToolAction = Omit<
  JsChatToolAction,
  "kind" | "output" | "outputText" | "rawInput" | "title" | "turnId"
> & {
  kind?: JsChatToolAction["kind"] | "elicitation" | string;
  output?: ChatToolActionOutput[];
  outputText?: string;
  rawInput?: string | null;
  title?: string | null;
  turnId?: string;
};

export type ChatToolCallPart = Omit<JsChatToolCallPart, "artifact"> & {
  artifact: ChatToolAction;
};

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

export interface ChatPrewarmInput {
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

export interface ChatStreamStartInput {
  input: ChatSendInput;
  streamId: string;
}

export interface ChatStreamElicitationResolveInput {
  elicitationId: string;
  response: ChatElicitationResponse;
  streamId: string;
}

export interface ChatStreamController {
  cancel: () => void;
  resolveElicitation: (
    input: Omit<ChatStreamElicitationResolveInput, "streamId">,
  ) => Promise<void>;
}

export interface ChatStreamApi {
  send: (
    input: ChatSendInput,
    onEvent: (streamEvent: ChatStreamEvent) => void,
  ) => ChatStreamController;
}

export const CHAT_STREAM_CANCEL_CHANNEL = "chat:stream:cancel";
export const CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL =
  "chat:stream:elicitation:resolve";
export const CHAT_STREAM_START_CHANNEL = "chat:stream:start";

export function chatToolActionToPart(action: ChatToolAction): ChatToolCallPart {
  return jsChatToolActionToPart(action as JsChatToolAction) as ChatToolCallPart;
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
  return cloneJsChatHistoryPart(
    part as JsChatHistoryMessagePart,
  ) as ChatHistoryMessagePart;
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

export function cloneChatPlanData(data: ChatPlanData): ChatPlanData {
  return cloneJsChatPlanData(data);
}

export function normalizeChatPlanMessages(
  messages: ChatHistoryMessage[],
): ChatHistoryMessage[] {
  return normalizeJsChatPlanMessages(
    messages as JsChatHistoryMessage[],
  ) as ChatHistoryMessage[];
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

export function chatStreamEventChannel(streamId: string): string {
  return `chat:stream:event:${streamId}`;
}

export { normalizeChatAttachmentsInput };
