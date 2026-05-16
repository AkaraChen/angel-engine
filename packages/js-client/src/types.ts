import type {
  ActionOutputSnapshot,
  AgentStateSnapshot,
  AvailableCommandSnapshot,
  DisplayPlanSnapshot,
  DisplayToolActionSnapshot,
  ElicitationSnapshot,
  ErrorSnapshot,
  ModelOptionSnapshot,
  ModeOptionSnapshot,
  PermissionModeOptionSnapshot,
  PlanEntrySnapshot,
  QuestionOptionSnapshot,
  QuestionSnapshot,
  ReasoningLevelOptionSnapshot,
  TurnRunEvent,
  TurnRunResult,
} from "@angel-engine/client-napi";

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type NullableOptional<T> = { [K in keyof T]?: T[K] | null };
type RequireFrom<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
type RuntimeConfigOptionDescription =
  | ModelOptionSnapshot["description"]
  | ModeOptionSnapshot["description"]
  | PermissionModeOptionSnapshot["description"]
  | ReasoningLevelOptionSnapshot["description"];
type RuntimeConfigOptionLabel =
  | ModelOptionSnapshot["name"]
  | ModeOptionSnapshot["name"]
  | PermissionModeOptionSnapshot["name"]
  | ReasoningLevelOptionSnapshot["label"];
type RuntimeConfigOptionValue =
  | ModelOptionSnapshot["id"]
  | ModeOptionSnapshot["id"]
  | PermissionModeOptionSnapshot["id"]
  | ReasoningLevelOptionSnapshot["value"];

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
  description?: RuntimeConfigOptionDescription | null;
  label: RuntimeConfigOptionLabel;
  value: RuntimeConfigOptionValue;
}

export type ChatAvailableCommand = AvailableCommandSnapshot;

export type ChatAgentState = NullableOptional<AgentStateSnapshot>;

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

export type ChatPlanEntryStatus = PlanEntrySnapshot["status"];

export type ChatPlanEntry = PlanEntrySnapshot;

export type ChatPlanData = Omit<DisplayPlanSnapshot, "kind" | "path"> & {
  kind?: DisplayPlanSnapshot["kind"] | null;
  path?: DisplayPlanSnapshot["path"] | null;
  presentation?: "created" | "updated" | null;
};

export type ChatToolActionPhase = DisplayToolActionSnapshot["phase"];

export type ChatToolActionOutput = ActionOutputSnapshot;

export type ChatToolActionError = ErrorSnapshot;

export type ChatToolAction = NonNullable<TurnRunEvent["action"]>;

export type ChatElicitationQuestionOption = PartialBy<
  QuestionOptionSnapshot,
  "description"
>;

export type ChatElicitationQuestion = PartialBy<
  Omit<QuestionSnapshot, "options"> & {
    options?: ChatElicitationQuestionOption[];
  },
  "header" | "isOther" | "isSecret" | "question"
>;

export type ChatElicitation = Omit<
  ElicitationSnapshot,
  "actionId" | "body" | "choices" | "questions" | "title" | "turnId"
> & {
  actionId?: ElicitationSnapshot["actionId"] | null;
  body?: ElicitationSnapshot["body"] | null;
  choices?: ElicitationSnapshot["choices"];
  questions?: ChatElicitationQuestion[];
  title?: ElicitationSnapshot["title"] | null;
  turnId?: ElicitationSnapshot["turnId"] | null;
};

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
  result?: ChatJsonValue;
  toolCallId: string;
  toolName: string;
  type: "tool-call";
};

export type ChatHistoryMessagePart =
  | { text: string; type: "reasoning" | "text" }
  | {
      filename?: string;
      image: string;
      mimeType?: string;
      type: "image";
    }
  | {
      data: string;
      filename?: string;
      mimeType: string;
      mention?: boolean;
      path?: string | null;
      type: "file";
    }
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

export type ChatAttachmentInput =
  | {
      data: string;
      mimeType: string;
      name?: string | null;
      path?: string | null;
      type: "file" | "image";
    }
  | {
      mimeType?: string | null;
      name?: string | null;
      path: string;
      type: "fileMention";
    };

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
  actions: TurnRunResult["actions"];
  chat: Chat;
  chatId: string;
  config?: ChatRuntimeConfig;
  content: ChatHistoryMessagePart[];
  model?: TurnRunResult["model"];
  reasoning?: TurnRunResult["reasoning"];
  text: TurnRunResult["text"];
  turnId?: TurnRunResult["turnId"];
}

export type ChatStreamDelta = RequireFrom<
  Pick<TurnRunEvent, "part" | "text" | "turnId">,
  "part" | "text"
> & {
  type: "delta";
};

type ChatPlanStreamEvent = {
  plan: NonNullable<TurnRunEvent["plan"]> & ChatPlanData;
  turnId?: TurnRunEvent["turnId"];
  type: "plan";
};

type ChatToolStreamEvent = {
  action: NonNullable<TurnRunEvent["action"]> & ChatToolAction;
  type: "tool" | "toolDelta";
};

type ChatElicitationStreamEvent = {
  elicitation: NonNullable<TurnRunEvent["elicitation"]> & ChatElicitation;
  type: "elicitation";
};

type ChatResultStreamEvent = {
  result: Omit<TurnRunResult, "conversation" | "message" | "turn"> &
    ChatSendResult;
  type: "result";
};

export type ChatStreamEvent =
  | {
      chat: Chat;
      type: "chat";
    }
  | ChatStreamDelta
  | ChatPlanStreamEvent
  | ChatToolStreamEvent
  | ChatElicitationStreamEvent
  | ChatResultStreamEvent
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
