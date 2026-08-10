import type { ChatAttachmentInput } from "../types.js";
import { parseDataUrl } from "./media.js";

/** Single source of truth for chat upload limits, enforced at this boundary. */
export const CHAT_ATTACHMENT_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Actual file/image payloads per message; mentions are not uploads. */
export const CHAT_ATTACHMENT_MAX_FILES = 5;

/**
 * Picker hint shared by both clients. The receiving boundary re-checks every
 * payload against the same families, so this string never grants acceptance
 * by itself.
 */
export const CHAT_ATTACHMENT_ACCEPT =
  "image/*,.pdf,.txt,.md,.markdown,.csv,.json,.log";

type ChatAttachmentFamily = "image" | "pdf" | "text";

const TEXT_LIKE_MIME_TYPES = new Set([
  "application/json",
  "text/csv",
  "text/markdown",
  "text/plain",
  "text/x-log",
]);

const EXTENSION_FAMILIES: Readonly<Record<string, ChatAttachmentFamily>> = {
  csv: "text",
  gif: "image",
  jpeg: "image",
  jpg: "image",
  json: "text",
  log: "text",
  markdown: "text",
  md: "text",
  pdf: "pdf",
  png: "image",
  svg: "image",
  txt: "text",
  webp: "image",
};

function familyForMimeType(mimeType: string): ChatAttachmentFamily | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (TEXT_LIKE_MIME_TYPES.has(mimeType)) return "text";
  return null;
}

function extensionOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const base = name.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return null;
  return base.slice(dot + 1).toLowerCase();
}

/**
 * The one upload-type decision used by pickers and by the receiving boundary.
 * A known filename extension must agree with the declared MIME family;
 * contradictions are rejected instead of trusting either hint alone.
 */
export function chatAttachmentTypeAccepted(file: {
  mimeType: string;
  name?: string | null;
}): boolean {
  const mimeFamily = familyForMimeType(file.mimeType);
  if (mimeFamily === null) return false;
  const extension = extensionOf(file.name);
  if (extension === null) return true;
  const extensionFamily = EXTENSION_FAMILIES[extension];
  // Unknown extensions cannot contradict the MIME family.
  if (extensionFamily === undefined) return true;
  return extensionFamily === mimeFamily;
}

/** Exact decoded byte length of a base64 payload, `=` padding included. */
export function base64ByteSize(data: string): number {
  const compact = data.replace(/\s+/g, "");
  if (compact.length === 0) return 0;
  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  return Math.floor((compact.length * 3) / 4) - padding;
}

export function normalizeChatAttachmentsInput(
  input: unknown,
): ChatAttachmentInput[] {
  if (input == null) return [];
  if (!Array.isArray(input)) {
    throw new TypeError("Chat attachments must be an array.");
  }

  const normalized = input.map((item) => normalizeChatAttachmentInput(item));
  const uploadCount = normalized.filter(
    (item) => item.type === "file" || item.type === "image",
  ).length;
  if (uploadCount > CHAT_ATTACHMENT_MAX_FILES) {
    throw new Error(
      `Chat attachments are limited to ${CHAT_ATTACHMENT_MAX_FILES} files.`,
    );
  }
  return normalized;
}

function normalizeChatAttachmentInput(input: unknown): ChatAttachmentInput {
  if (!input || typeof input !== "object") {
    throw new Error("Chat attachment is invalid.");
  }

  const value = input as Partial<ChatAttachmentInput>;
  if (
    value.type !== "image" &&
    value.type !== "file" &&
    value.type !== "fileMention" &&
    value.type !== "skillMention"
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
  if (value.type === "skillMention") {
    if (typeof value.path !== "string" || !value.path) {
      throw new Error("Skill mention path is required.");
    }
    if (typeof value.name !== "string" || !value.name) {
      throw new Error("Skill mention name is required.");
    }
    return {
      name: value.name,
      path: value.path,
      type: "skillMention",
    };
  }

  const dataValue = (value as { data?: unknown }).data;
  if (typeof dataValue !== "string" || !dataValue) {
    throw new Error("Chat attachment data is required.");
  }
  const mimeTypeValue = (value as { mimeType?: unknown }).mimeType;
  if (typeof mimeTypeValue !== "string" || !mimeTypeValue) {
    throw new Error("Chat attachment MIME type is required.");
  }

  const parsed = parseDataUrl(dataValue);
  if (parsed && parsed.mimeType !== mimeTypeValue) {
    throw new Error(
      "Chat attachment data URL and declared MIME type disagree.",
    );
  }
  const mimeType = parsed?.mimeType ?? mimeTypeValue;
  const data = parsed?.data ?? dataValue;
  if (value.type === "image" && !mimeType.startsWith("image/")) {
    throw new Error("Image attachment MIME type is required.");
  }

  const name = typeof value.name === "string" && value.name ? value.name : null;
  if (!chatAttachmentTypeAccepted({ mimeType, name })) {
    throw new Error("Unsupported chat attachment type.");
  }
  if (base64ByteSize(data) > CHAT_ATTACHMENT_MAX_FILE_BYTES) {
    throw new Error("Chat attachment exceeds the maximum file size.");
  }

  return {
    data,
    mimeType,
    name,
    path: typeof value.path === "string" && value.path ? value.path : null,
    type: mimeType.startsWith("image/") ? "image" : "file",
  };
}

function pathName(path: string) {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}
