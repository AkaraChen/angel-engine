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
import {
  chatCreateInput,
  chatPrewarmInput,
  chatRuntimeConfigInput,
  chatSendInput,
  chatSetModeInput,
} from "./schemas";

export function parseChatCreateInput(input: unknown): ChatCreateInput {
  const value = parseObjectInput(
    chatCreateInput,
    input,
    "Chat input is required.",
  );

  return {
    cwd: value.cwd,
    model: value.model,
    projectId: value.projectId,
    mode: value.mode,
    reasoningEffort: value.reasoningEffort,
    runtime: parseRuntime(value.runtime),
    title: value.title,
  };
}

export function parseChatPrewarmInput(input: unknown): ChatPrewarmInput {
  const value = parseObjectInput(
    chatPrewarmInput,
    input,
    "Chat prewarm input is required.",
  );

  return {
    cwd: value.cwd,
    projectId: value.projectId,
    runtime: parseRuntime(value.runtime),
  };
}

export function parseChatRuntimeConfigInput(
  input: unknown,
): ChatRuntimeConfigInput {
  const value = parseObjectInput(
    chatRuntimeConfigInput,
    input,
    "Chat runtime config input is required.",
  );

  return {
    cwd: value.cwd,
    runtime: parseRuntime(value.runtime),
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
    chatId: value.chatId,
    cwd: value.cwd,
    model: value.model,
    projectId: value.projectId,
    mode: value.mode,
    prewarmId: value.prewarmId,
    reasoningEffort: value.reasoningEffort,
    runtime: parseRuntime(value.runtime),
    text: value.text,
  };
}

export function parseChatSetModeInput(input: unknown): ChatSetModeInput {
  const value = parseObjectInput(
    chatSetModeInput,
    input,
    "Chat mode input is required.",
  );

  return {
    chatId: value.chatId,
    cwd: value.cwd,
    mode: value.mode,
  };
}

export function parseChatId(input: unknown): string {
  return parseStringInput(input, "Chat id is required.");
}

function parseRuntime(value: string | undefined) {
  return value ? normalizeAgentRuntime(value) : undefined;
}
