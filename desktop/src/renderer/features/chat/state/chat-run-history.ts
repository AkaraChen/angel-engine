import type {
  ChatHistoryMessage,
  ChatHistoryMessagePart,
} from "@angel-engine/daemon-api/chat";
import type {
  AppendMessage,
  CompleteAttachment,
  ThreadMessage,
} from "@assistant-ui/react";
import type { EngineMessage } from "./chat-run-types";
import {
  chatPartsText,
  chatPlanPartName,
  chatToolActionToPart,
  cloneChatHistoryPart,
  isChatElicitationData,
  isChatErrorData,
  isChatPlanData,
  isChatToolAction,
  normalizeChatPlanMessages,
} from "@angel-engine/daemon-api/chat";
import is from "@sindresorhus/is";
import {
  engineMessageAttachmentsToHistoryParts,
  fileHistoryPartFromMessagePart,
  historyFilePartToAttachment,
  historyImagePartToAttachment,
  imageHistoryPartFromDataUrl,
} from "./chat-run-attachments";

export function appendMessageToEngineMessage(
  message: AppendMessage,
  id: string,
): EngineMessage {
  return {
    ...message,
    attachments: message.attachments,
    content: message.content,
    createdAt: new Date(),
    id,
    metadata: message.metadata,
    role: message.role,
    status: message.status,
  } as EngineMessage;
}

export function historyMessageToEngineMessage(
  message: ChatHistoryMessage,
): EngineMessage {
  const createdAt = is.nonEmptyString(message.createdAt)
    ? new Date(message.createdAt)
    : undefined;
  const normalizedCreatedAt =
    createdAt && Number.isFinite(createdAt.getTime()) ? createdAt : new Date();
  const content = message.content.map(cloneChatHistoryPart);

  if (message.role === "assistant") {
    const backendFailure = backendFailureText(content);
    return {
      content: content.map(historyPartToEngineMessagePart),
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
      status:
        backendFailure === undefined
          ? {
              reason: "stop",
              type: "complete",
            }
          : {
              error: backendFailure,
              reason: "error",
              type: "incomplete",
            },
    } as EngineMessage;
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

  const userMessage = userHistoryMessageContentToEngineMessage(
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
  } as EngineMessage;
}

function backendFailureText(parts: readonly ChatHistoryMessagePart[]) {
  for (const part of parts) {
    if (part.type === "data" && isChatErrorData(part.data)) {
      return part.data.message;
    }
    if (part.type === "text" && part.text.startsWith("Backend chat failed:")) {
      return part.text.replace(/^Backend chat failed:\s*/, "");
    }
  }
  return undefined;
}

export function engineMessagesToHistoryMessages(
  messages: EngineMessage[],
): ChatHistoryMessage[] {
  return normalizeChatPlanMessages(
    messages
      .map(engineMessageToHistoryMessage)
      .filter((message) => message.content.length > 0),
  );
}

function engineMessageToHistoryMessage(
  message: EngineMessage,
): ChatHistoryMessage {
  const contentParts = engineMessageContentToHistoryParts(message.content);
  const attachmentParts = engineMessageAttachmentsToHistoryParts(
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

export function engineMessageContentToHistoryParts(
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
        const imagePart = imageHistoryPartFromDataUrl(
          part.image,
          part.filename ?? null,
        );
        return imagePart ? [imagePart] : [];
      }
      case "file":
        return [fileHistoryPartFromMessagePart(part)];
      case "audio":
      case "generative-ui":
      case "source":
        return [];
      case "data":
        if (part.name === "chat-error" && isChatErrorData(part.data)) {
          return [
            {
              data: part.data,
              name: "chat-error",
              type: "data",
            },
          ];
        }
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

export function historyPartToEngineMessagePart(
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
      ...(is.nonEmptyString(part.path) ? { path: part.path } : {}),
      type: "file",
    } as ThreadMessage["content"][number];
  }

  return {
    filename: part.filename ?? undefined,
    image: part.image,
    type: "image",
  } as ThreadMessage["content"][number];
}

function userHistoryMessageContentToEngineMessage(
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

    content.push(historyPartToEngineMessagePart(part));
  }

  return {
    attachments,
    content: content as ThreadMessage["content"],
  };
}

export function getMessageText(message: Pick<ThreadMessage, "content">) {
  return message.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}
