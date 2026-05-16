import type {
  AppendMessage,
  CompleteAttachment,
  ThreadMessage,
} from "@assistant-ui/react";
import type {
  ChatAttachmentInput,
  ChatHistoryMessage,
  ChatHistoryMessagePart,
} from "./types.js";
import is from "@sindresorhus/is";
import {
  chatPartsText,
  chatPlanPartName,
  chatToolActionToPart,
  cloneChatHistoryPart,
  imageDataUrl,
  isChatElicitationData,
  isChatPlanData,
  isChatToolAction,
  normalizeChatPlanMessages,
  parseDataUrl,
  parseImageDataUrl,
} from "./utils/index.js";

export type AssistantUiMessage = ThreadMessage;

export function appendMessageToAssistantMessage(
  message: AppendMessage,
  id: string,
): AssistantUiMessage {
  return {
    ...message,
    attachments: message.attachments,
    content: message.content,
    createdAt: new Date(),
    id,
    metadata: message.metadata,
    role: message.role,
    status: message.status,
  } as AssistantUiMessage;
}

export function historyMessageToAssistantMessage(
  message: ChatHistoryMessage,
): AssistantUiMessage {
  const createdAt = message.createdAt ? new Date(message.createdAt) : undefined;
  const normalizedCreatedAt =
    createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : new Date();
  const content = message.content.map(cloneChatHistoryPart);

  if (message.role === "assistant") {
    return {
      content: content.map(historyPartToAssistantMessagePart),
      createdAt: normalizedCreatedAt,
      id: message.id,
      metadata: {
        custom: {},
        steps: [],
        unstable_annotations: [],
        unstable_data: [],
        unstable_state: null,
      },
      role: "assistant",
      status: {
        reason: "stop",
        type: "complete",
      },
    } as AssistantUiMessage;
  }

  if (message.role === "system") {
    return {
      content: [{ text: chatPartsText(content, "text"), type: "text" }],
      createdAt: normalizedCreatedAt,
      id: message.id,
      metadata: {
        custom: {},
      },
      role: "system",
    };
  }

  const userMessage = userHistoryMessageContentToAssistantMessage(
    message.id,
    content,
  );

  return {
    attachments: userMessage.attachments,
    content: userMessage.content,
    createdAt: normalizedCreatedAt,
    id: message.id,
    metadata: {
      custom: {},
    },
    role: "user",
  } as AssistantUiMessage;
}

export function assistantMessagesToHistoryMessages(
  messages: AssistantUiMessage[],
): ChatHistoryMessage[] {
  return normalizeChatPlanMessages(
    messages
      .map(assistantMessageToHistoryMessage)
      .filter((message) => message.content.length > 0),
  );
}

export function assistantMessageToHistoryMessage(
  message: AssistantUiMessage,
): ChatHistoryMessage {
  const contentParts = assistantMessageContentToHistoryParts(message.content);
  const attachmentParts = assistantMessageAttachmentsToHistoryParts(
    message.attachments,
    contentParts,
  );
  return {
    content: [...contentParts, ...attachmentParts],
    createdAt: message.createdAt?.toISOString(),
    id: message.id,
    role: message.role,
  };
}

export function assistantMessageContentToHistoryParts(
  content: ThreadMessage["content"],
): ChatHistoryMessagePart[] {
  return content.flatMap((part) => {
    switch (part.type) {
      case "reasoning":
      case "text":
        return part.text ? [{ ...part }] : [];
      case "tool-call":
        return isChatToolAction(part.artifact)
          ? [cloneChatHistoryPart(chatToolActionToPart(part.artifact))]
          : [];
      case "image": {
        return [imageHistoryPartFromDataUrl(part.image, part.filename ?? null)];
      }
      case "file":
        return [fileHistoryPartFromMessagePart(part)];
      case "data":
        if (
          (part.name === "plan" || part.name === "todo") &&
          isChatPlanData(part.data)
        ) {
          return [
            {
              data: part.data,
              name: chatPlanPartName(part.data),
              type: "data",
            },
          ];
        }
        if (part.name === "elicitation" && isChatElicitationData(part.data)) {
          return [{ data: part.data, name: "elicitation", type: "data" }];
        }
        return [];
      default:
        return [];
    }
  });
}

export function historyPartToAssistantMessagePart(
  part: ChatHistoryMessagePart,
): ThreadMessage["content"][number] {
  if (part.type === "data") {
    return {
      data: part.data,
      name: part.name,
      type: "data",
    } as ThreadMessage["content"][number];
  }

  if (part.type !== "image" && part.type !== "file") {
    return part as ThreadMessage["content"][number];
  }

  if (part.type === "file") {
    return {
      data: part.data,
      filename: part.filename ?? undefined,
      ...(part.mention ? { mention: part.mention } : {}),
      mimeType: part.mimeType,
      ...(part.path ? { path: part.path } : {}),
      type: "file",
    } as ThreadMessage["content"][number];
  }

  return {
    filename: part.filename ?? undefined,
    image: part.image,
    type: "image",
  } as ThreadMessage["content"][number];
}

export function getAssistantMessageText(
  message: Pick<ThreadMessage, "content">,
): string {
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

export function getAssistantMessageAttachments(
  message: Pick<ThreadMessage, "attachments" | "content">,
): ChatAttachmentInput[] {
  const inputs: ChatAttachmentInput[] = [];

  if (message.attachments) {
    for (const attachment of message.attachments) {
      for (const part of attachment.content) {
        const input = attachmentInputFromMessagePart(part, attachment.name);
        if (input) inputs.push(input);
      }
    }
  }

  for (const part of message.content) {
    const input = attachmentInputFromMessagePart(part);
    if (input) inputs.push(input);
  }

  return inputs;
}

export function attachmentInputToHistoryPart(
  input: ChatAttachmentInput,
): ChatHistoryMessagePart {
  if (input.type === "fileMention") {
    if (!is.string(input.mimeType)) {
      throw new Error("File mention attachment is missing mimeType.");
    }
    return {
      data: input.path,
      filename: input.name ?? undefined,
      mention: true,
      mimeType: input.mimeType,
      path: input.path,
      type: "file",
    };
  }

  if (input.type === "image") {
    return {
      filename: input.name ?? undefined,
      image: imageDataUrl(input.data, input.mimeType),
      mimeType: input.mimeType,
      type: "image",
    };
  }

  return {
    data: input.data,
    filename: input.name ?? undefined,
    mimeType: input.mimeType,
    type: "file",
  };
}

function userHistoryMessageContentToAssistantMessage(
  messageId: string,
  parts: ChatHistoryMessagePart[],
): {
  attachments: CompleteAttachment[];
  content: ThreadMessage["content"];
} {
  const attachments: CompleteAttachment[] = [];
  const content: ThreadMessage["content"][number][] = [];

  for (const [index, part] of parts.entries()) {
    if (part.type === "image") {
      attachments.push(historyImagePartToAttachment(messageId, index, part));
      continue;
    }
    if (part.type === "file") {
      attachments.push(historyFilePartToAttachment(messageId, index, part));
      continue;
    }
    content.push(historyPartToAssistantMessagePart(part));
  }

  return {
    attachments,
    content: content as ThreadMessage["content"],
  };
}

function historyImagePartToAttachment(
  messageId: string,
  index: number,
  part: Extract<ChatHistoryMessagePart, { type: "image" }>,
): CompleteAttachment {
  return {
    content: [
      {
        filename: part.filename,
        image: part.image,
        type: "image",
      },
    ],
    contentType: part.mimeType,
    id: `${messageId}-attachment-${index}`,
    name: part.filename ?? "image",
    status: { type: "complete" },
    type: "image",
  };
}

function historyFilePartToAttachment(
  messageId: string,
  index: number,
  part: Extract<ChatHistoryMessagePart, { type: "file" }>,
): CompleteAttachment {
  return {
    content: [
      {
        data: part.data,
        filename: part.filename,
        ...(part.mention ? { mention: true } : {}),
        mimeType: part.mimeType,
        ...(part.path ? { path: part.path } : {}),
        type: "file",
      },
    ],
    contentType: part.mimeType,
    id: `${messageId}-attachment-${index}`,
    name: part.filename ?? "file",
    status: { type: "complete" },
    type: "file",
  };
}

function imageHistoryPartFromDataUrl(
  image: string,
  filename: string | null,
): ChatHistoryMessagePart {
  const parsed = parseImageDataUrl(image);
  if (!parsed) {
    throw new Error("Assistant UI image part is not a data URL.");
  }

  return {
    filename: filename ?? undefined,
    image: imageDataUrl(parsed.data, parsed.mimeType),
    mimeType: parsed.mimeType,
    type: "image",
  };
}

function fileHistoryPartFromMessagePart(
  part: Extract<ThreadMessage["content"][number], { type: "file" }>,
): ChatHistoryMessagePart {
  const parsed = parseDataUrl(part.data);
  const mimeType = parsed?.mimeType ?? part.mimeType;
  const data = parsed?.data ?? part.data;
  if (mimeType.startsWith("image/")) {
    return {
      filename: part.filename ?? undefined,
      image: imageDataUrl(data, mimeType),
      mimeType,
      type: "image",
    };
  }
  return {
    data,
    filename: part.filename ?? undefined,
    mention: messagePartMention(part),
    mimeType,
    path: messagePartPath(part),
    type: "file",
  };
}

function assistantMessageAttachmentsToHistoryParts(
  attachments: ThreadMessage["attachments"] | undefined,
  existingParts: ChatHistoryMessagePart[],
): ChatHistoryMessagePart[] {
  const existingKeys = new Set(existingParts.map(historyPartKey));
  const parts: ChatHistoryMessagePart[] = [];

  if (!attachments) return parts;
  for (const attachment of attachments) {
    for (const part of attachment.content) {
      const input = attachmentInputFromMessagePart(part, attachment.name);
      if (!input) continue;
      const historyPart = attachmentInputToHistoryPart(input);
      const key = historyPartKey(historyPart);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      parts.push(historyPart);
    }
  }

  return parts;
}

function attachmentInputFromMessagePart(
  part: ThreadMessage["content"][number],
  fallbackName?: string,
): ChatAttachmentInput | undefined {
  if (part.type === "file" && messagePartMention(part)) {
    const path = messagePartPath(part);
    if (!path) return undefined;
    return {
      mimeType: part.mimeType,
      name: part.filename ?? fallbackName ?? null,
      path,
      type: "fileMention",
    };
  }

  if (part.type === "image") {
    const parsed = parseImageDataUrl(part.image);
    if (!parsed) return undefined;
    return {
      data: parsed.data,
      mimeType: parsed.mimeType,
      name: part.filename ?? fallbackName ?? null,
      path: messagePartPath(part),
      type: "image",
    };
  }

  if (part.type === "file" && part.mimeType.startsWith("image/")) {
    const parsed = parseDataUrl(part.data);
    if (!parsed && part.data.startsWith("data:")) return undefined;
    return {
      data: parsed?.data ?? part.data,
      mimeType: parsed?.mimeType ?? part.mimeType,
      name: part.filename ?? fallbackName ?? null,
      path: messagePartPath(part),
      type: "image",
    };
  }

  if (part.type === "file") {
    const parsed = parseDataUrl(part.data);
    if (!parsed && part.data.startsWith("data:")) return undefined;
    return {
      data: parsed?.data ?? part.data,
      mimeType: parsed?.mimeType ?? part.mimeType,
      name: part.filename ?? fallbackName ?? null,
      path: messagePartPath(part),
      type: "file",
    };
  }

  return undefined;
}

function messagePartPath(part: ThreadMessage["content"][number]) {
  const path = (
    part as ThreadMessage["content"][number] & {
      path?: unknown;
    }
  ).path;
  return typeof path === "string" && path ? path : null;
}

function messagePartMention(part: ThreadMessage["content"][number]) {
  return (
    (
      part as ThreadMessage["content"][number] & {
        mention?: unknown;
      }
    ).mention === true
  );
}

function historyPartKey(part: ChatHistoryMessagePart) {
  if (part.type === "image") return `image:${part.image}`;
  if (part.type === "file") return `file:${part.mimeType}:${part.data}`;
  return `${part.type}:${JSON.stringify(part)}`;
}
