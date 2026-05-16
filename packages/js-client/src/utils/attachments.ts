import type { ChatAttachmentInput } from "../types.js";
import { parseDataUrl } from "./media.js";

export function normalizeChatAttachmentsInput(
  input: unknown,
): ChatAttachmentInput[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new TypeError("Chat attachments must be an array.");
  }

  return input.map((item) => normalizeChatAttachmentInput(item));
}

function normalizeChatAttachmentInput(input: unknown): ChatAttachmentInput {
  if (!input || typeof input !== "object") {
    throw new Error("Chat attachment is invalid.");
  }

  const value = input as Partial<ChatAttachmentInput>;
  if (
    value.type !== "image" &&
    value.type !== "file" &&
    value.type !== "fileMention"
  ) {
    throw new Error("Unsupported chat attachment type.");
  }
  if (value.type === "fileMention") {
    if (typeof value.path !== "string" || !value.path) {
      throw new Error("Mentioned file path is required.");
    }
    return {
      mimeType:
        typeof value.mimeType === "string" && value.mimeType
          ? value.mimeType
          : null,
      name:
        typeof value.name === "string" && value.name
          ? value.name
          : pathName(value.path),
      path: value.path,
      type: "fileMention",
    };
  }

  const dataValue = (value as { data?: unknown }).data;
  if (typeof dataValue !== "string" || !dataValue) {
    throw new Error("Chat attachment data is required.");
  }
  if (typeof value.mimeType !== "string" || !value.mimeType) {
    throw new Error("Chat attachment MIME type is required.");
  }

  const parsed = parseDataUrl(dataValue);
  const mimeType = parsed?.mimeType ?? value.mimeType;
  const data = parsed?.data ?? dataValue;
  if (value.type === "image" && !mimeType.startsWith("image/")) {
    throw new Error("Image attachment MIME type is required.");
  }

  return {
    data,
    mimeType,
    name: typeof value.name === "string" && value.name ? value.name : null,
    path: typeof value.path === "string" && value.path ? value.path : null,
    type: mimeType.startsWith("image/") ? "image" : "file",
  };
}

function pathName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}
