import type { ChatJsonObject } from "@angel-engine/js-client";
import type { EngineEventJson, PiAgentMessage } from "./types.js";
import type { PiToolInput } from "./tooling.js";

import {
  EngineEventActionOutputKind,
  EngineEventActionPhase,
  EngineEventContentKind,
  EngineEventHistoryRole,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import {
  actionKind,
  normalizeToolInput,
  piHistoryToolCall,
  piHistoryToolResult,
  stringifyJson,
  stringifyToolResult,
  toolInputSummary,
  toolTitle,
} from "./tooling.js";

interface HistoryToolUse {
  id: string;
  input: PiToolInput;
  name: string;
}

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

export function historyEventsFromSessionMessages(
  conversationId: string,
  messages: PiAgentMessage[],
): EngineEventJson[] {
  const toolUses = new Map<string, HistoryToolUse>();
  return messages.flatMap((message) =>
    historyEventsFromSessionMessage(conversationId, message, toolUses),
  );
}

function historyEventsFromSessionMessage(
  conversationId: string,
  message: PiAgentMessage,
  toolUses: Map<string, HistoryToolUse>,
): EngineEventJson[] {
  switch (message.role) {
    case "user":
      return userHistoryEvents(conversationId, message.content);
    case "assistant":
      return message.content.flatMap((block) => {
        if (block.type === "text") {
          return block.text
            ? [
                historyReplayChunk(
                  conversationId,
                  EngineEventHistoryRole.Assistant,
                  {
                    [EngineEventContentKind.Text]: block.text,
                  },
                ),
              ]
            : [];
        }
        if (block.type === "thinking") {
          return block.thinking
            ? [
                historyReplayChunk(
                  conversationId,
                  EngineEventHistoryRole.Reasoning,
                  {
                    [EngineEventContentKind.Text]: block.thinking,
                  },
                ),
              ]
            : [];
        }
        if (block.type === "toolCall") {
          const input = normalizeToolInput(block.arguments);
          toolUses.set(block.id, {
            id: block.id,
            input,
            name: block.name,
          });
          return [
            historyReplayChunk(
              conversationId,
              EngineEventHistoryRole.Tool,
              {
                [EngineEventContentKind.Structured]: JSON.stringify(
                  piHistoryToolCall(block.id, block.name, input),
                ),
              },
              historyToolCallAction(block.id, block.name, input),
            ),
          ];
        }
        return [];
      });
    case "toolResult": {
      const toolUse = toolUses.get(message.toolCallId);
      if (!toolUse) {
        throw new Error(
          `Pi history tool result has no matching tool call: ${message.toolCallId}`,
        );
      }
      return [
        historyReplayChunk(
          conversationId,
          EngineEventHistoryRole.Tool,
          {
            [EngineEventContentKind.Structured]: JSON.stringify(
              piHistoryToolResult({
                content: message.content,
                isError: message.isError,
                toolId: message.toolCallId,
                toolName: message.toolName,
              }),
            ),
          },
          historyToolResultAction(
            message.toolCallId,
            message.toolName,
            message.content,
            message.isError,
          ),
        ),
      ];
    }
    case "bashExecution":
    case "branchSummary":
    case "compactionSummary":
    case "custom":
      return [];
  }
}

function userHistoryEvents(
  conversationId: string,
  content: Extract<PiAgentMessage, { role: "user" }>["content"],
): EngineEventJson[] {
  if (is.string(content)) {
    return content
      ? [
          historyReplayChunk(conversationId, EngineEventHistoryRole.User, {
            [EngineEventContentKind.Text]: content,
          }),
        ]
      : [];
  }
  const parts = content.flatMap((block): HistoryContentPart[] => {
    if (block.type === "text") return block.text ? [{ Text: block.text }] : [];
    if (block.type === "image") {
      return [
        {
          File: {
            data: block.data,
            mime_type: block.mimeType,
            name: null,
          },
        },
      ];
    }
    return [];
  });
  return parts.length === 0
    ? []
    : [
        historyReplayChunk(conversationId, EngineEventHistoryRole.User, {
          [EngineEventContentKind.Parts]: parts,
        }),
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
  input: PiToolInput,
): HistoryReplayToolAction {
  return {
    error: null,
    id: toolId,
    input_summary: toolInputSummary(toolName, input),
    kind: actionKind(toolName),
    output: [],
    phase: EngineEventActionPhase.Running,
    raw_input: stringifyJson(input),
    title: toolTitle(toolName, input),
  };
}

function historyToolResultAction(
  toolId: string,
  toolName: string,
  content: unknown,
  isError: boolean,
): HistoryReplayToolAction {
  return {
    error: null,
    id: toolId,
    kind: actionKind(toolName),
    output: [
      {
        [EngineEventActionOutputKind.Text]: stringifyToolResult({ content }),
      },
    ],
    phase: isError
      ? EngineEventActionPhase.Failed
      : EngineEventActionPhase.Completed,
  };
}
