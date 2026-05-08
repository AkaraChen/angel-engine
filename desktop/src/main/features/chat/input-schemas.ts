import { type as arkType } from "arktype";

import type { AgentRuntime } from "../../../shared/agents";
import { normalizeAgentRuntime } from "../../../shared/agents";
import type {
  ChatCreateInput,
  ChatPrewarmInput,
  ChatRuntimeConfigInput,
  ChatSendInput,
  ChatSetModeInput,
} from "../../../shared/chat";
import { normalizeChatAttachmentsInput } from "../../../shared/chat";
import { parseObjectInput, parseStringInput } from "../../ipc/validation";

const chatCreateInput = arkType({
  "+": "ignore",
  "cwd?": "unknown",
  "model?": "unknown",
  "mode?": "unknown",
  "projectId?": "unknown",
  "reasoningEffort?": "unknown",
  "runtime?": "unknown",
  "title?": "unknown",
});

const chatPrewarmInput = arkType({
  "+": "ignore",
  "cwd?": "unknown",
  "projectId?": "unknown",
  "runtime?": "unknown",
});

const chatRuntimeConfigInput = arkType({
  "+": "ignore",
  "cwd?": "unknown",
  "runtime?": "unknown",
});

const chatSendInput = arkType({
  "+": "ignore",
  "attachments?": "unknown",
  "chatId?": "unknown",
  "cwd?": "unknown",
  "model?": "unknown",
  "mode?": "unknown",
  "prewarmId?": "unknown",
  "projectId?": "unknown",
  "reasoningEffort?": "unknown",
  "runtime?": "unknown",
  "text?": "unknown",
});

const chatSetModeInput = arkType({
  "+": "ignore",
  "chatId?": "unknown",
  "cwd?": "unknown",
  "mode?": "unknown",
});

export function parseChatCreateInput(input: unknown): ChatCreateInput {
  if (!input || typeof input !== "object") {
    return {};
  }

  const value = parseObjectInput(
    chatCreateInput,
    input,
    "Chat input is required.",
  );

  return {
    cwd: normalizeOptionalNonEmptyString(value.cwd),
    model: normalizeOptionalConfigInput(value.model),
    projectId: normalizeOptionalProjectId(value.projectId),
    mode: normalizeOptionalConfigInput(value.mode),
    reasoningEffort: normalizeOptionalConfigInput(value.reasoningEffort),
    runtime: normalizeOptionalRuntime(value.runtime),
    title: normalizeOptionalTrimmedString(value.title),
  };
}

export function parseChatPrewarmInput(input: unknown): ChatPrewarmInput {
  if (!input || typeof input !== "object") {
    return {};
  }

  const value = parseObjectInput(
    chatPrewarmInput,
    input,
    "Chat prewarm input is required.",
  );

  return {
    cwd: normalizeOptionalNonEmptyString(value.cwd),
    projectId: normalizeOptionalProjectId(value.projectId),
    runtime: normalizeOptionalRuntime(value.runtime),
  };
}

export function parseChatRuntimeConfigInput(
  input: unknown,
): ChatRuntimeConfigInput {
  if (!input || typeof input !== "object") {
    return {};
  }

  const value = parseObjectInput(
    chatRuntimeConfigInput,
    input,
    "Chat runtime config input is required.",
  );

  return {
    cwd: normalizeOptionalNonEmptyString(value.cwd),
    runtime: normalizeOptionalRuntime(value.runtime),
  };
}

export function parseChatSendInput(input: unknown): ChatSendInput {
  const value = parseObjectInput(
    chatSendInput,
    input,
    "Chat input is required.",
  );

  return {
    attachments: normalizeChatAttachmentsInput(value.attachments),
    chatId: normalizeOptionalTrimmedString(value.chatId),
    cwd: normalizeOptionalNonEmptyString(value.cwd),
    model: normalizeOptionalConfigInput(value.model),
    projectId: normalizeOptionalProjectId(value.projectId),
    mode: normalizeOptionalConfigInput(value.mode),
    prewarmId: normalizeOptionalTrimmedString(value.prewarmId),
    reasoningEffort: normalizeOptionalConfigInput(value.reasoningEffort),
    runtime: normalizeOptionalRuntime(value.runtime),
    text: parseStringInput(value.text, "Chat text is required."),
  };
}

export function parseChatSetModeInput(input: unknown): ChatSetModeInput {
  const value = parseObjectInput(
    chatSetModeInput,
    input,
    "Chat mode input is required.",
  );
  const mode = normalizeOptionalConfigInput(value.mode);
  if (!mode) {
    throw new Error("Chat mode is required.");
  }

  return {
    chatId: parseStringInput(value.chatId, "Chat id is required.").trim(),
    cwd: normalizeOptionalNonEmptyString(value.cwd),
    mode,
  };
}

export function parseChatId(input: unknown): string {
  return parseStringInput(input, "Chat id is required.");
}

function normalizeOptionalRuntime(value: unknown): AgentRuntime | undefined {
  if (typeof value !== "string" || !value.trim()) {
    return undefined;
  }

  return normalizeAgentRuntime(value);
}

function normalizeOptionalConfigInput(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeOptionalNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeOptionalProjectId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeOptionalTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
