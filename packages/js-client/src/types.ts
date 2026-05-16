export interface Project {
  id: string;
  path: string;
}

export interface CreateProjectInput {
  id?: string;
  path: string;
}

export interface Chat {
  archived: boolean;
  createdAt: string;
  cwd: string | null;
  id: string;
  projectId: string | null;
  remoteThreadId: string | null;
  runtime: string;
  title: string;
  updatedAt: string;
}

export interface ChatCreateInput {
  model?: string | null;
  mode?: string | null;
  permissionMode?: string | null;
  projectId?: string;
  reasoningEffort?: string | null;
  runtime?: string;
  title?: string;
}

export interface ChatRuntimeConfigInput {
  cwd?: string;
  runtime?: string;
}

export interface ChatRuntimeConfigOption {
  description?: string | null;
  label: string;
  value: string;
}

export interface ChatAvailableCommand {
  description: string;
  inputHint?: string | null;
  name: string;
}

export interface ChatAgentState {
  currentMode?: string | null;
  currentPermissionMode?: string | null;
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

export type ChatJsonValue =
  | boolean
  | null
  | number
  | string
  | ChatJsonValue[]
  | { readonly [key: string]: ChatJsonValue };

export interface ChatJsonObject {
  readonly [key: string]: ChatJsonValue;
}

export type ChatPlanEntryStatus = "completed" | "in_progress" | "pending";

export interface ChatPlanEntry {
  content: string;
  status: ChatPlanEntryStatus;
}

export interface ChatPlanData {
  entries: ChatPlanEntry[];
  kind?: "review" | "todo" | null;
  path?: string | null;
  presentation?: "created" | "updated" | null;
  text: string;
}

export type ChatToolActionPhase =
  | "awaitingDecision"
  | "cancelled"
  | "completed"
  | "declined"
  | "failed"
  | "proposed"
  | "running"
  | "streamingResult";

export interface ChatToolActionOutput {
  kind: string;
  text: string;
}

export interface ChatToolActionError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface ChatToolAction {
  elicitationId?: string | null;
  error?: ChatToolActionError | null;
  id: string;
  inputSummary?: string | null;
  kind?: string;
  output?: ChatToolActionOutput[];
  outputText?: string;
  phase?: ChatToolActionPhase;
  rawInput?: string | null;
  title?: string | null;
  turnId?: string;
}

export interface ChatElicitationQuestionOption {
  description?: string;
  label: string;
}

export interface ChatElicitationQuestion {
  header?: string;
  id: string;
  isOther?: boolean;
  isSecret?: boolean;
  options?: ChatElicitationQuestionOption[];
  question?: string;
}

export interface ChatElicitation {
  actionId?: string | null;
  body?: string | null;
  choices?: string[];
  id: string;
  kind: string;
  phase: string;
  questions?: ChatElicitationQuestion[];
  title?: string | null;
  turnId?: string | null;
}

export interface ChatHistoryMessage {
  content: ChatHistoryMessagePart[];
  createdAt?: string;
  id: string;
  role: "assistant" | "system" | "user";
}

export type ChatToolCallPart = {
  args: ChatJsonObject;
  argsText: string;
  artifact: ChatToolAction;
  isError?: boolean;
  result?: unknown;
  toolCallId: string;
  toolName: string;
  type: "tool-call";
};

export type ChatHistoryMessagePart =
  | { text: string; type: "reasoning" | "text" }
  | {
      data: ChatPlanData;
      name: "plan" | "todo";
      type: "data";
    }
  | {
      data: ChatElicitation;
      name: "elicitation";
      type: "data";
    }
  | ChatToolCallPart;

export interface ChatLoadResult {
  chat: Chat;
  config?: ChatRuntimeConfig;
  messages: ChatHistoryMessage[];
}

export interface ChatAttachmentInput {
  data?: string;
  mimeType?: string | null;
  name?: string | null;
  path?: string | null;
  type: "file" | "fileMention" | "image";
}

export interface ChatSendInput {
  attachments?: ChatAttachmentInput[];
  chatId?: string;
  model?: string | null;
  mode?: string | null;
  permissionMode?: string | null;
  prewarmId?: string;
  projectId?: string;
  reasoningEffort?: string | null;
  runtime?: string;
  text: string;
}

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

export type ChatStreamEvent =
  | {
      chat: Chat;
      type: "chat";
    }
  | {
      part: "reasoning" | "text";
      text: string;
      turnId?: string;
      type: "delta";
    }
  | {
      plan: ChatPlanData;
      turnId?: string;
      type: "plan";
    }
  | {
      action: ChatToolAction;
      type: "tool" | "toolDelta";
    }
  | {
      elicitation: ChatElicitation;
      type: "elicitation";
    }
  | {
      result: ChatSendResult;
      type: "result";
    }
  | {
      message: string;
      type: "error";
    }
  | {
      type: "done";
    };

export type AngelClientEvent =
  | { chat: Chat; type: "chat.created" | "chat.updated" }
  | { chatId: string; message: ChatHistoryMessage; type: "message.appended" }
  | { chatId: string; event: ChatStreamEvent; type: "run.event" };
