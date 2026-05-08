export type Chat = {
  id: string;
  title: string;
  projectId: string | null;
  cwd: string | null;
  runtime: string;
  remoteThreadId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatCreateInput = {
  cwd?: string;
  model?: string | null;
  mode?: string | null;
  projectId?: string | null;
  reasoningEffort?: string | null;
  runtime?: string;
  title?: string;
};

export type ChatPrewarmInput = {
  cwd?: string;
  projectId?: string | null;
  runtime?: string;
};

export type ChatRuntimeConfigInput = {
  cwd?: string;
  runtime?: string;
};

export type ChatSetModeInput = {
  chatId: string;
  cwd?: string;
  mode: string;
};

export type ChatRuntimeConfigOption = {
  description?: string | null;
  label: string;
  value: string;
};

export type ChatAgentState = {
  currentMode?: string | null;
};

export type ChatRuntimeConfig = {
  agentState?: ChatAgentState;
  canSetModel?: boolean;
  canSetMode?: boolean;
  canSetReasoningEffort?: boolean;
  currentMode?: string | null;
  currentModel?: string | null;
  currentReasoningEffort?: string | null;
  modes: ChatRuntimeConfigOption[];
  models: ChatRuntimeConfigOption[];
  reasoningEfforts: ChatRuntimeConfigOption[];
};

export type ChatHistoryMessage = {
  content: ChatHistoryMessagePart[];
  createdAt?: string;
  id: string;
  role: "assistant" | "system" | "user";
};

export type ChatJsonValue =
  | boolean
  | null
  | number
  | string
  | ChatJsonValue[]
  | { readonly [key: string]: ChatJsonValue };

export type ChatJsonObject = { readonly [key: string]: ChatJsonValue };

export type ChatPlanEntryStatus = "completed" | "inProgress" | "pending";

export type ChatPlanEntry = {
  content: string;
  status: ChatPlanEntryStatus;
};

export type ChatPlanData = {
  entries: ChatPlanEntry[];
  path?: string | null;
  text: string;
};

export type ChatHistoryMessagePart =
  | {
      text: string;
      type: "reasoning" | "text";
    }
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
      type: "file";
    }
  | {
      data: ChatPlanData;
      name: "plan";
      type: "data";
    }
  | {
      data: ChatElicitation;
      name: "elicitation";
      type: "data";
    }
  | ChatToolCallPart;

export type ChatToolActionOutput = {
  kind: string;
  text: string;
};

export type ChatToolActionError = {
  code: string;
  message: string;
  recoverable: boolean;
};

export type ChatToolAction = {
  error?: ChatToolActionError | null;
  id: string;
  inputSummary?: string | null;
  kind?: string;
  output?: ChatToolActionOutput[];
  outputText?: string;
  phase?: string;
  rawInput?: string | null;
  title?: string | null;
  turnId?: string;
};

export type ChatElicitationQuestionOption = {
  description?: string;
  label: string;
};

export type ChatElicitationQuestion = {
  header?: string;
  id: string;
  isOther?: boolean;
  isSecret?: boolean;
  options?: ChatElicitationQuestionOption[];
  question?: string;
};

export type ChatElicitation = {
  actionId?: string | null;
  body?: string | null;
  choices?: string[];
  id: string;
  kind: string;
  phase: string;
  questions?: ChatElicitationQuestion[];
  title?: string | null;
  turnId?: string | null;
};

export type ChatElicitationAnswer = {
  id: string;
  value: string;
};

export type ChatElicitationResponse =
  | { type: "allow" }
  | { type: "allowForSession" }
  | { type: "deny" }
  | { type: "cancel" }
  | { answers: ChatElicitationAnswer[]; type: "answers" }
  | { success: boolean; type: "dynamicToolResult" }
  | { type: "externalComplete" }
  | { type: "raw"; value: string };

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

export function chatToolActionToPart(action: ChatToolAction): ChatToolCallPart {
  const outputText = action.outputText?.trim() ? action.outputText : undefined;
  const errorText = action.error?.message;
  const result = outputText ?? errorText;

  return {
    args: parseChatJsonObject(action.rawInput) ?? {},
    argsText: action.rawInput || action.inputSummary || "",
    artifact: action,
    ...(action.error ? { isError: true } : {}),
    ...(result ? { result } : {}),
    toolCallId: action.id,
    toolName: action.kind || "tool",
    type: "tool-call",
  };
}

function parseChatJsonObject(
  value?: string | null,
): ChatJsonObject | undefined {
  if (!value) return undefined;

  try {
    const parsed: unknown = JSON.parse(value);
    return isChatJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isChatJsonObject(value: unknown): value is ChatJsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isChatToolAction(value: unknown): value is ChatToolAction {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as Partial<ChatToolAction>).id === "string"
  );
}

export function appendChatTextPart(
  parts: ChatHistoryMessagePart[],
  type: "reasoning" | "text",
  text: string,
) {
  if (!text) return;

  const last = parts.at(-1);
  if (last?.type === type) {
    last.text += text;
    return;
  }

  parts.push({ text, type });
}

export function cloneChatHistoryPart(
  part: ChatHistoryMessagePart,
): ChatHistoryMessagePart {
  switch (part.type) {
    case "tool-call":
      return {
        ...part,
        artifact: cloneChatToolAction(part.artifact),
      };
    case "image":
      return { ...part };
    case "file":
      return { ...part };
    case "data":
      if (part.name === "elicitation") {
        return {
          ...part,
          data: cloneChatElicitation(part.data),
        };
      }
      return {
        ...part,
        data: cloneChatPlanData(part.data),
      };
    case "reasoning":
    case "text":
      return { ...part };
  }
}

function cloneChatToolAction(action: ChatToolAction): ChatToolAction {
  return {
    ...action,
    error: action.error ? { ...action.error } : action.error,
    output: action.output?.map((item) => ({ ...item })),
  };
}

export function chatPartsText(
  parts: ChatHistoryMessagePart[],
  type: "reasoning" | "text",
) {
  return parts.reduce(
    (text, part) => (part.type === type ? text + part.text : text),
    "",
  );
}

export function imageDataUrl(data: string, mimeType: string) {
  return `data:${mimeType};base64,${data}`;
}

export function isChatPlanData(value: unknown): value is ChatPlanData {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ChatPlanData>;
  return (
    Array.isArray(data.entries) &&
    data.entries.every(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        typeof (entry as Partial<ChatPlanEntry>).content === "string" &&
        isChatPlanEntryStatus((entry as Partial<ChatPlanEntry>).status),
    ) &&
    typeof data.text === "string" &&
    (data.path === undefined ||
      data.path === null ||
      typeof data.path === "string")
  );
}

export function isChatElicitationData(
  value: unknown,
): value is ChatElicitation {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ChatElicitation>;
  return (
    typeof data.id === "string" &&
    typeof data.kind === "string" &&
    typeof data.phase === "string" &&
    (data.actionId === undefined ||
      data.actionId === null ||
      typeof data.actionId === "string") &&
    (data.body === undefined ||
      data.body === null ||
      typeof data.body === "string") &&
    (data.title === undefined ||
      data.title === null ||
      typeof data.title === "string") &&
    (data.turnId === undefined ||
      data.turnId === null ||
      typeof data.turnId === "string") &&
    (data.choices === undefined ||
      (Array.isArray(data.choices) &&
        data.choices.every((choice) => typeof choice === "string"))) &&
    (data.questions === undefined ||
      (Array.isArray(data.questions) &&
        data.questions.every(isChatElicitationQuestion)))
  );
}

export function cloneChatPlanData(data: ChatPlanData): ChatPlanData {
  return {
    entries: data.entries.map((entry) => ({ ...entry })),
    path: data.path ?? null,
    text: data.text,
  };
}

export function cloneChatElicitation(data: ChatElicitation): ChatElicitation {
  return {
    ...data,
    choices: data.choices ? [...data.choices] : data.choices,
    questions: data.questions?.map((question) => ({
      ...question,
      options: question.options?.map((option) => ({ ...option })),
    })),
  };
}

export function upsertChatPlanPart(
  parts: ChatHistoryMessagePart[],
  plan: ChatPlanData,
) {
  const nextPart: ChatHistoryMessagePart = {
    data: cloneChatPlanData(plan),
    name: "plan",
    type: "data",
  };
  const index = parts.findIndex(
    (part) => part.type === "data" && part.name === "plan",
  );

  if (index === -1) {
    const firstToolIndex = parts.findIndex((part) => part.type === "tool-call");
    if (firstToolIndex === -1) {
      parts.push(nextPart);
    } else {
      parts.splice(firstToolIndex, 0, nextPart);
    }
    return;
  }

  parts[index] = nextPart;
}

export function upsertChatElicitationPart(
  parts: ChatHistoryMessagePart[],
  elicitation: ChatElicitation,
) {
  const nextPart: ChatHistoryMessagePart = {
    data: cloneChatElicitation(elicitation),
    name: "elicitation",
    type: "data",
  };
  const index = parts.findIndex(
    (part) =>
      part.type === "data" &&
      part.name === "elicitation" &&
      part.data.id === elicitation.id,
  );

  if (index === -1) {
    parts.push(nextPart);
    return;
  }

  parts[index] = nextPart;
}

function isChatPlanEntryStatus(status: unknown): status is ChatPlanEntryStatus {
  return (
    status === "pending" || status === "inProgress" || status === "completed"
  );
}

function isChatElicitationQuestion(
  value: unknown,
): value is ChatElicitationQuestion {
  if (!value || typeof value !== "object") return false;
  const question = value as Partial<ChatElicitationQuestion>;
  return (
    typeof question.id === "string" &&
    (question.header === undefined || typeof question.header === "string") &&
    (question.question === undefined ||
      typeof question.question === "string") &&
    (question.isOther === undefined || typeof question.isOther === "boolean") &&
    (question.isSecret === undefined ||
      typeof question.isSecret === "boolean") &&
    (question.options === undefined ||
      (Array.isArray(question.options) &&
        question.options.every(isChatElicitationQuestionOption)))
  );
}

function isChatElicitationQuestionOption(
  value: unknown,
): value is ChatElicitationQuestionOption {
  if (!value || typeof value !== "object") return false;
  const option = value as Partial<ChatElicitationQuestionOption>;
  return (
    typeof option.label === "string" &&
    (option.description === undefined || typeof option.description === "string")
  );
}

export function parseDataUrl(value: string):
  | {
      data: string;
      mimeType: string;
    }
  | undefined {
  const match = /^data:([^;,]+)(?:;[^,]*)*;base64,(.*)$/i.exec(value);
  if (!match) return undefined;
  const mimeType = match[1] ?? "";
  const data = match[2] ?? "";
  if (!mimeType || !data) return undefined;
  return { data, mimeType };
}

export function isTerminalChatToolPhase(phase?: string) {
  return (
    phase === "completed" ||
    phase === "failed" ||
    phase === "declined" ||
    phase === "cancelled"
  );
}

export type ChatLoadResult = {
  chat: Chat;
  config?: ChatRuntimeConfig;
  messages: ChatHistoryMessage[];
};

export type ChatPrewarmResult = {
  config?: ChatRuntimeConfig;
  prewarmId: string;
};

export type ChatSetModeResult = {
  chat: Chat;
  config: ChatRuntimeConfig;
};

export type ChatAttachmentInput =
  | {
      data: string;
      mimeType: string;
      name?: string | null;
      path?: string | null;
      type: "image";
    }
  | {
      data: string;
      mimeType: string;
      name?: string | null;
      path?: string | null;
      type: "file";
    };

export type ChatSendInput = {
  attachments?: ChatAttachmentInput[];
  chatId?: string;
  cwd?: string;
  model?: string | null;
  mode?: string | null;
  prewarmId?: string;
  projectId?: string | null;
  reasoningEffort?: string | null;
  runtime?: string;
  text: string;
};

export type ChatSendResult = {
  chat: Chat;
  chatId: string;
  config?: ChatRuntimeConfig;
  content: ChatHistoryMessagePart[];
  model?: string;
  reasoning?: string;
  text: string;
  turnId?: string;
};

export type ChatStreamPart = "reasoning" | "text";

export type ChatStreamDelta = {
  part: ChatStreamPart;
  text: string;
  turnId?: string;
  type: "delta";
};

export type ChatStreamEvent =
  | ChatStreamDelta
  | {
      plan: ChatPlanData;
      turnId?: string;
      type: "plan";
    }
  | {
      elicitation: ChatElicitation;
      type: "elicitation";
    }
  | {
      action: ChatToolAction;
      type: "tool";
    }
  | {
      chat: Chat;
      type: "chat";
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

export type ChatStreamStartInput = {
  input: ChatSendInput;
  streamId: string;
};

export type ChatStreamElicitationResolveInput = {
  elicitationId: string;
  response: ChatElicitationResponse;
  streamId: string;
};

export type ChatStreamController = {
  cancel: () => void;
  resolveElicitation: (
    input: Omit<ChatStreamElicitationResolveInput, "streamId">,
  ) => Promise<void>;
};

export type ChatStreamApi = {
  send(
    input: ChatSendInput,
    onEvent: (streamEvent: ChatStreamEvent) => void,
  ): ChatStreamController;
};

export const CHAT_STREAM_CANCEL_CHANNEL = "chat:stream:cancel";
export const CHAT_STREAM_ELICITATION_RESOLVE_CHANNEL =
  "chat:stream:elicitation:resolve";
export const CHAT_STREAM_START_CHANNEL = "chat:stream:start";

export function chatStreamEventChannel(streamId: string) {
  return `chat:stream:event:${streamId}`;
}

export function normalizeChatAttachmentsInput(
  input: unknown,
): ChatAttachmentInput[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new Error("Chat attachments must be an array.");
  }

  return input.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Chat attachment is invalid.");
    }

    const value = item as Partial<ChatAttachmentInput>;
    if (value.type !== "image" && value.type !== "file") {
      throw new Error("Unsupported chat attachment type.");
    }
    if (typeof value.data !== "string" || !value.data.trim()) {
      throw new Error("Chat attachment data is required.");
    }
    if (typeof value.mimeType !== "string" || !value.mimeType.trim()) {
      throw new Error("Chat attachment MIME type is required.");
    }

    const parsed = parseDataUrl(value.data);
    const mimeType = parsed?.mimeType ?? value.mimeType.trim();
    const data = parsed?.data ?? value.data;
    if (value.type === "image" && !mimeType.startsWith("image/")) {
      throw new Error("Image attachment MIME type is required.");
    }

    return {
      data,
      mimeType,
      name:
        typeof value.name === "string" && value.name.trim()
          ? value.name.trim()
          : null,
      path:
        typeof value.path === "string" && value.path.trim()
          ? value.path.trim()
          : null,
      type: mimeType.startsWith("image/") ? "image" : "file",
    };
  });
}
