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

export type ChatRuntimeConfigOption = {
  description?: string | null;
  label: string;
  value: string;
};

export type ChatRuntimeConfig = {
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
  | ChatToolCallPart;

export type ChatJsonValue =
  | boolean
  | null
  | number
  | string
  | ChatJsonValue[]
  | { readonly [key: string]: ChatJsonValue };

export type ChatJsonObject = { readonly [key: string]: ChatJsonValue };

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

export type ChatAttachmentInput = {
  data: string;
  mimeType: string;
  name?: string | null;
  type: "image";
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
    if (value.type !== "image") {
      throw new Error("Unsupported chat attachment type.");
    }
    if (typeof value.data !== "string" || !value.data.trim()) {
      throw new Error("Image attachment data is required.");
    }
    if (
      typeof value.mimeType !== "string" ||
      !value.mimeType.startsWith("image/")
    ) {
      throw new Error("Image attachment MIME type is required.");
    }

    return {
      data: value.data,
      mimeType: value.mimeType,
      name:
        typeof value.name === "string" && value.name.trim()
          ? value.name.trim()
          : null,
      type: "image",
    };
  });
}
