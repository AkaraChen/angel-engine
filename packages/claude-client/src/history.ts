import type { SessionMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ChatJsonObject, ChatJsonValue } from "@angel-engine/js-client";
import type { ClaudeToolInput } from "./sdk-types.js";
import type { EngineEventJson } from "./types.js";

import {
  EngineEventActionOutputKind,
  EngineEventActionPhase,
  EngineEventContentKind,
  EngineEventHistoryRole,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { lookup } from "mime-types";
import path from "node:path";
import { structuredPlanFromToolUse } from "./plan.js";
import {
  actionKind,
  claudeHistoryToolCall,
  claudeHistoryToolResult,
  stringifyToolResult,
  toolInputSummary,
  toolTitle,
} from "./tooling.js";

interface HistoryToolUse {
  id: string;
  input: ClaudeToolInput;
  name: string;
}

type ReadonlyJsonObject = { readonly [key: string]: ChatJsonValue };
type HistoryContentPart =
  | { Text: string }
  | {
      File: {
        data: string;
        mime_type: string;
        name: string | null;
      };
    };

interface HistoryReplayToolAction {
  error: null;
  id: string;
  input_summary?: string;
  kind: string;
  output: Array<{ [EngineEventActionOutputKind.Text]: string }>;
  phase: string;
  raw_input?: string;
  title?: string;
}

type AssistantHistoryBlock =
  | { text: string; type: "text" }
  | { thinking: string; type: "thinking" }
  | { id: string; input: object; name: string; type: "tool_use" };

type UserHistoryBlock =
  | { text: string; type: "text" }
  | {
      content: string | object[];
      is_error?: boolean;
      tool_use_id: string;
      type: "tool_result";
    };

export function historyEventsFromSessionMessages(
  conversationId: string,
  messages: SessionMessage[],
): EngineEventJson[] {
  const toolUses = new Map<string, HistoryToolUse>();
  return messages.flatMap((message) =>
    historyEventsFromSessionMessage(conversationId, message, toolUses),
  );
}

function historyEventsFromSessionMessage(
  conversationId: string,
  message: SessionMessage,
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  if (!is.plainObject(message.message)) {
    throw new Error("Claude history message must be an object.");
  }
  const content = message.message.content;
  if (is.string(content)) {
    const role =
      message.type === "user"
        ? EngineEventHistoryRole.User
        : EngineEventHistoryRole.Assistant;
    return content
      ? [
          historyReplayChunk(conversationId, role, {
            [EngineEventContentKind.Text]: content,
          }),
        ]
      : [];
  }
  if (!is.array(content, is.plainObject)) {
    throw new Error(
      "Claude history message content must be a string or array.",
    );
  }
  const blocks = content as readonly ReadonlyJsonObject[];
  if (message.type === "assistant") {
    return blocks.flatMap((block) => {
      if (block.type === "text") {
        if (!is.string(block.text)) {
          throw new Error("Claude assistant text history block is malformed.");
        }
        return assistantHistoryEvents(
          conversationId,
          { text: block.text, type: "text" },
          toolUses,
        );
      }
      if (block.type === "thinking") {
        if (!is.string(block.thinking)) {
          throw new Error(
            "Claude assistant thinking history block is malformed.",
          );
        }
        return assistantHistoryEvents(
          conversationId,
          { thinking: block.thinking, type: "thinking" },
          toolUses,
        );
      }
      if (block.type === "tool_use") {
        if (
          !is.nonEmptyString(block.id) ||
          !is.nonEmptyString(block.name) ||
          !is.plainObject(block.input)
        ) {
          throw new Error(
            "Claude assistant tool_use history block is malformed.",
          );
        }
        return assistantHistoryEvents(
          conversationId,
          {
            id: block.id,
            input: block.input,
            name: block.name,
            type: "tool_use",
          },
          toolUses,
        );
      }
      return [];
    });
  }
  if (message.type === "user") {
    const events: EngineEventJson[] = [];
    let contentParts: HistoryContentPart[] = [];
    const flushUserContent = (): void => {
      if (contentParts.length === 0) return;
      events.push(
        historyReplayChunk(conversationId, EngineEventHistoryRole.User, {
          [EngineEventContentKind.Parts]: contentParts,
        }),
      );
      contentParts = [];
    };

    for (const block of blocks) {
      if (block.type === "text") {
        if (!is.string(block.text)) {
          throw new Error("Claude user text history block is malformed.");
        }
        contentParts.push(...userTextContentParts(block.text));
        continue;
      }
      if (block.type === "tool_result") {
        if (
          !is.nonEmptyString(block.tool_use_id) ||
          (!is.string(block.content) &&
            !is.array(block.content, is.plainObject)) ||
          (block.is_error !== undefined && !is.boolean(block.is_error))
        ) {
          throw new Error(
            "Claude user tool_result history block is malformed.",
          );
        }
        flushUserContent();
        events.push(
          ...userHistoryEvents(
            conversationId,
            {
              content: is.string(block.content)
                ? block.content
                : (block.content as object[]),
              ...(block.is_error === undefined
                ? {}
                : { is_error: block.is_error }),
              tool_use_id: block.tool_use_id,
              type: "tool_result",
            },
            toolUses,
          ),
        );
        continue;
      }
    }
    flushUserContent();
    return events;
  }
  return [];
}

function userTextContentParts(text: string): HistoryContentPart[] {
  if (!text) return [];
  const attachment = claudeAttachmentTextPart(text);
  return attachment ? [attachment] : [{ Text: text }];
}

function claudeAttachmentTextPart(
  text: string,
): HistoryContentPart | undefined {
  return claudeAttachedTextResourcePart(text) ?? claudeResourceTextPart(text);
}

function claudeAttachedTextResourcePart(
  text: string,
): HistoryContentPart | undefined {
  const match =
    /^Attached text resource: (?<uri>\S+)\r?\nMIME type: (?<mimeType>[^\r\n]+)\r?\n\r?\n/.exec(
      text,
    );
  if (!match?.groups?.uri || !match.groups.mimeType.trim()) return undefined;
  const data = text.slice(match[0].length);
  if (!data) return undefined;
  return {
    File: {
      data,
      mime_type: match.groups.mimeType.trim(),
      name: decodedFileNameFromUri(match.groups.uri),
    },
  };
}

function claudeResourceTextPart(text: string): HistoryContentPart | undefined {
  const match = /^Resource: (?<uri>\S+)\r?\n\r?\n/.exec(text);
  if (!match?.groups?.uri) return undefined;
  const data = text.slice(match[0].length);
  if (!data) return undefined;
  const name = decodedFileNameFromUri(match.groups.uri);
  return {
    File: {
      data,
      mime_type: mimeTypeFromFileName(name),
      name,
    },
  };
}

function decodedFileNameFromUri(uri: string): string | null {
  const pathname = URL.canParse(uri) ? new URL(uri).pathname : uri;
  const rawName = path.posix.basename(pathname);
  if (!rawName || rawName === ".") return null;
  try {
    return decodeURIComponent(rawName);
  } catch {
    return rawName;
  }
}

function mimeTypeFromFileName(name: string | null): string {
  return (name && lookup(name)) || "text/plain";
}

function assistantHistoryEvents(
  conversationId: string,
  block: AssistantHistoryBlock,
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  if (block.type === "text") {
    const text = block.text;
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.Assistant, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  if (block.type === "thinking") {
    const text = block.thinking;
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.Reasoning, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  const id = block.id;
  const name = block.name;
  const input = block.input as ClaudeToolInput;
  toolUses.set(id, { id, input, name });

  const plan = structuredPlanFromToolUse(name, input);
  if (plan) {
    return [
      historyReplayChunk(conversationId, EngineEventHistoryRole.Assistant, {
        [EngineEventContentKind.Structured]: JSON.stringify(plan),
      }),
    ];
  }

  return [
    historyReplayChunk(
      conversationId,
      EngineEventHistoryRole.Tool,
      {
        [EngineEventContentKind.Structured]: JSON.stringify(
          claudeHistoryToolCall(id, name, input),
        ),
      },
      historyToolCallAction(id, name, input),
    ),
  ];
}

function userHistoryEvents(
  conversationId: string,
  block: UserHistoryBlock,
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  if (block.type === "text") {
    const text = block.text;
    return text
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.User, {
            [EngineEventContentKind.Text]: text,
          }),
        ]
      : [];
  }
  const toolId = block.tool_use_id;
  const toolUse = toolUses.get(toolId);
  if (!toolUse) {
    // Keep this fail-fast: 155 local Claude transcripts had no orphaned tool_result blocks.
    throw new Error(
      `Claude history tool result has no matching tool_use: ${toolId}`,
    );
  }
  const toolResult = claudeHistoryToolResult({
    content: block.content,
    input: toolUse.input,
    isError: block.is_error === true,
    toolId,
    toolName: toolUse.name,
  });
  return [
    historyReplayChunk(
      conversationId,
      EngineEventHistoryRole.Tool,
      {
        [EngineEventContentKind.Structured]: JSON.stringify(toolResult),
      },
      historyToolResultAction(
        toolId,
        toolUse.name,
        block.content,
        block.is_error === true,
      ),
    ),
  ];
}

function historyReplayChunk(
  conversationId: string,
  role: `${EngineEventHistoryRole}`,
  content: ChatJsonObject,
  tool?: HistoryReplayToolAction,
): EngineEventJson {
  return {
    HistoryReplayChunk: {
      conversation_id: conversationId,
      entry: { content, role, ...(tool ? { tool } : {}) },
    },
  };
}

function historyToolCallAction(
  toolId: string,
  toolName: string,
  input: ClaudeToolInput,
): HistoryReplayToolAction {
  return {
    error: null,
    id: toolId,
    input_summary: toolInputSummary(toolName, input),
    kind: actionKind(toolName, input),
    output: [],
    phase: EngineEventActionPhase.Running,
    raw_input: JSON.stringify(input),
    title: toolTitle(toolName, input),
  };
}

function historyToolResultAction(
  toolId: string,
  toolName: string,
  content: object | object[] | string,
  isError: boolean,
): HistoryReplayToolAction {
  return {
    error: null,
    id: toolId,
    kind: actionKind(toolName),
    output: [
      {
        [EngineEventActionOutputKind.Text]: stringifyToolResult(content),
      },
    ],
    phase: isError
      ? EngineEventActionPhase.Failed
      : EngineEventActionPhase.Completed,
  };
}
