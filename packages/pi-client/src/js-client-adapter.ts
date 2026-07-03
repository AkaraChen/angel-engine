import type { SendTextRequest } from "@angel-engine/client-napi";
import type {
  AgentAdapter,
  AgentRunContext,
  ChatAttachmentInput,
  ChatRuntimeConfig,
  ChatSendInput,
  ChatStreamEvent,
} from "@angel-engine/js-client";

import {
  projectTurnRunEvent,
  runtimeConfigFromConversationSnapshot,
} from "@angel-engine/js-client/projection";
import { normalizeChatAttachmentsInput } from "@angel-engine/js-client/utils/attachments";
import is from "@sindresorhus/is";
import { PiAgentSession } from "./session.js";

type ClientInput = NonNullable<SendTextRequest["input"]>;
type ClientInputItem = ClientInput[number];

export class PiAgentAdapter implements AgentAdapter {
  readonly id = "pi";

  async inspectConfig(input: { cwd?: string }): Promise<ChatRuntimeConfig> {
    const session = new PiAgentSession();
    try {
      return runtimeConfigFromConversationSnapshot(
        await session.inspect(input.cwd ?? process.cwd()),
      );
    } finally {
      session.close();
    }
  }

  async *run(
    input: ChatSendInput,
    context: AgentRunContext,
  ): AsyncIterable<ChatStreamEvent> {
    const session = new PiAgentSession();
    const queue: ChatStreamEvent[] = [];
    let done = false;
    let error: unknown;
    let wake: (() => void) | undefined;
    const push = (event: ChatStreamEvent): void => {
      queue.push(event);
      wake?.();
      wake = undefined;
    };

    const run = session
      .sendText({
        cwd: cwdFromContext(context),
        input: piClientInputFromChatAttachments(
          normalizeChatAttachmentsInput(input.attachments),
        ),
        model: input.model ?? undefined,
        mode: input.mode ?? undefined,
        onEvent: (event) => {
          const projected = projectTurnRunEvent(event);
          if (projected) push(projected);
        },
        permissionMode: input.permissionMode ?? undefined,
        reasoningEffort: input.reasoningEffort ?? undefined,
        remoteId: context.chat?.remoteThreadId ?? undefined,
        signal: context.signal,
        text: input.text,
      })
      .catch((caught: unknown) => {
        error = caught;
      })
      .finally(() => {
        done = true;
        session.close();
        wake?.();
        wake = undefined;
      });

    while (!done || queue.length > 0) {
      const event = queue.shift();
      if (event) {
        yield event;
        continue;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }

    await run;
    if (error) throw error;
  }
}

export function piClientInputFromChatAttachments(
  attachments: ChatAttachmentInput[],
): ClientInput {
  return attachments.map((attachment): ClientInputItem => {
    if (attachment.type === "fileMention") {
      return {
        mimeType: attachment.mimeType ?? null,
        name: is.nonEmptyString(attachment.name)
          ? attachment.name
          : pathName(attachment.path),
        path: attachment.path,
        type: "file_mention",
      };
    }

    if (attachment.type === "skillMention") {
      return {
        name: attachment.name,
        path: attachment.path,
        type: "skill_mention",
      };
    }

    if (attachment.type === "image") {
      return {
        data: attachment.data,
        mimeType: attachment.mimeType,
        name: attachment.name ?? null,
        type: "image",
      };
    }

    const uri = attachmentUri(attachment);
    if (attachment.mimeType.startsWith("text/")) {
      return {
        mimeType: attachment.mimeType,
        text: decodeBase64Utf8(attachment.data),
        type: "embedded_text_resource",
        uri,
      };
    }

    return {
      data: attachment.data,
      mimeType: attachment.mimeType,
      name: attachment.name ?? null,
      type: "embedded_blob_resource",
      uri,
    };
  });
}

function cwdFromContext(context: AgentRunContext): string {
  const cwd = context.project?.path ?? context.chat?.cwd ?? process.cwd();
  if (!is.nonEmptyString(cwd)) {
    throw new Error("Pi agent cwd is required.");
  }
  return cwd;
}

function attachmentUri(attachment: ChatAttachmentInput): string {
  const name = is.nonEmptyString(attachment.name)
    ? attachment.name
    : "attachment";
  return `attachment:///${encodeURIComponent(name)}`;
}

function pathName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function decodeBase64Utf8(value: string): string {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
