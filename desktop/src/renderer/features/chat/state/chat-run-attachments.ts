import type { CompleteAttachment, ThreadMessage } from "@assistant-ui/react";
import type { ChatAttachmentInput, ChatHistoryMessagePart } from "@shared/chat";
import { imageDataUrl, parseDataUrl } from "@shared/chat";
import is from "@sindresorhus/is";

export function historyImagePartToAttachment(
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

export function historyFilePartToAttachment(
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
        ...(is.nonEmptyString(part.path) ? { path: part.path } : {}),
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

export function imageHistoryPartFromDataUrl(
  image: string,
  filename: string | null,
  options?: { fallbackMimeType?: string },
): ChatHistoryMessagePart | undefined {
  const parsed = parseImageDataUrl(image);
  if (!parsed && !options?.fallbackMimeType?.startsWith("image/")) {
    return undefined;
  }

  return {
    filename: filename ?? undefined,
    image: parsed ? imageDataUrl(parsed.data, parsed.mimeType) : image,
    mimeType: parsed?.mimeType ?? options?.fallbackMimeType,
    type: "image",
  };
}

export function fileHistoryPartFromMessagePart(
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

export function engineMessageAttachmentsToHistoryParts(
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

export function getMessageAttachments(
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

function attachmentInputFromMessagePart(
  part: ThreadMessage["content"][number],
  fallbackName?: string,
): ChatAttachmentInput | undefined {
  if (part.type === "file" && messagePartSkill(part)) {
    const path = messagePartPath(part);
    const name = part.filename ?? fallbackName;
    if (!is.nonEmptyString(path) || !is.nonEmptyString(name)) return undefined;
    return {
      name,
      path,
      type: "skillMention",
    };
  }

  if (part.type === "file" && messagePartMention(part)) {
    const path = messagePartPath(part);
    if (!is.nonEmptyString(path)) return undefined;
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
  return is.nonEmptyString(path) ? path : null;
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

function messagePartSkill(part: ThreadMessage["content"][number]) {
  return (
    (
      part as ThreadMessage["content"][number] & {
        skill?: unknown;
      }
    ).skill === true
  );
}

function attachmentInputToHistoryPart(
  input: ChatAttachmentInput,
): ChatHistoryMessagePart {
  if (input.type === "skillMention") {
    return {
      data: input.path,
      filename: input.name,
      mention: true,
      mimeType: "text/plain",
      path: input.path,
      type: "file",
    };
  }

  if (input.type === "fileMention") {
    if (!is.nonEmptyString(input.mimeType)) {
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

function historyPartKey(part: ChatHistoryMessagePart) {
  if (part.type === "image") return `image:${part.image}`;
  if (part.type === "file") return `file:${part.mimeType}:${part.data}`;
  return `${part.type}:${JSON.stringify(part)}`;
}

function parseImageDataUrl(
  value: string,
): { data: string; mimeType: string } | undefined {
  const parsed = parseDataUrl(value);
  if (!parsed) return undefined;
  if (!parsed.mimeType.startsWith("image/") || !parsed.data) return undefined;
  return parsed;
}
