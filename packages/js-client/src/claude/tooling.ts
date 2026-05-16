import type { ChatJsonObject } from "../types.js";
import type { ClaudeToolInput } from "./sdk-types.js";
import type { ActiveClaudeTurn } from "./types.js";

import {
  EngineEventActionKind,
  EngineEventActionOutputKind,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { isClaudePlanToolUse } from "./plan.js";
import { CLAUDE_TOOL } from "./sdk-types.js";

export function actionKind(
  toolName: string,
  input?: ClaudeToolInput,
): `${EngineEventActionKind}` {
  if (isClaudePlanToolUse(toolName, input)) return EngineEventActionKind.Plan;

  switch (toolName) {
    case CLAUDE_TOOL.Bash:
      return EngineEventActionKind.Command;
    case CLAUDE_TOOL.Read:
    case CLAUDE_TOOL.Glob:
    case CLAUDE_TOOL.Grep:
    case CLAUDE_TOOL.LS:
      return EngineEventActionKind.Read;
    case CLAUDE_TOOL.Write:
      return EngineEventActionKind.Write;
    case CLAUDE_TOOL.Edit:
    case CLAUDE_TOOL.MultiEdit:
      return EngineEventActionKind.FileChange;
    case CLAUDE_TOOL.WebSearch:
    case CLAUDE_TOOL.WebFetch:
      return EngineEventActionKind.WebSearch;
    case CLAUDE_TOOL.Task:
    case CLAUDE_TOOL.Agent:
      return EngineEventActionKind.SubAgent;
    case CLAUDE_TOOL.AskUserQuestion:
      return EngineEventActionKind.HostCapability;
    default:
      return EngineEventActionKind.DynamicTool;
  }
}

export function toolOutputKind(
  actionId: string,
  output: string,
  active: ActiveClaudeTurn,
): `${EngineEventActionOutputKind}` {
  if (!active.actionIds.has(actionId)) return EngineEventActionOutputKind.Text;
  return output.includes("\n")
    ? EngineEventActionOutputKind.Terminal
    : EngineEventActionOutputKind.Text;
}

export function toolTitle(toolName: string, input: ClaudeToolInput): string {
  if (
    toolName === CLAUDE_TOOL.Bash &&
    "command" in input &&
    is.string(input.command)
  ) {
    return input.command;
  }
  if ("file_path" in input && is.string(input.file_path))
    return `${toolName} ${input.file_path}`;
  if ("path" in input && is.string(input.path))
    return `${toolName} ${input.path}`;
  if ("planFilePath" in input && is.string(input.planFilePath))
    return `${toolName} ${input.planFilePath}`;
  return toolName;
}

export function toolInputSummary(
  toolName: string,
  input: ClaudeToolInput,
): string {
  if (
    toolName === CLAUDE_TOOL.Bash &&
    "command" in input &&
    is.string(input.command)
  ) {
    return input.command;
  }
  if ("description" in input && is.string(input.description))
    return input.description;
  if ("prompt" in input && is.string(input.prompt)) return input.prompt;
  if ("file_path" in input && is.string(input.file_path))
    return input.file_path;
  if ("path" in input && is.string(input.path)) return input.path;
  if ("plan" in input && is.string(input.plan)) return input.plan;
  return JSON.stringify(input);
}

export function stringifyToolResult(
  value: object | readonly object[] | string | null | undefined,
): string {
  if (is.string(value)) return value;
  if (Array.isArray(value)) {
    return value
      .map((block) => contentBlockText(block))
      .filter(Boolean)
      .join("\n");
  }
  if (is.nullOrUndefined(value)) {
    throw new Error("Claude tool result content is required.");
  }
  return JSON.stringify(value);
}

export function contentBlockText(block: object): string {
  if (!is.plainObject(block)) {
    throw new Error("Claude content block must be an object.");
  }

  if (block.type === "text" && is.string(block.text)) return block.text;

  if (block.type === "thinking" && is.string(block.thinking)) {
    return block.thinking;
  }

  if (
    block.type === "tool_use" &&
    is.string(block.name) &&
    is.plainObject(block.input)
  ) {
    return `[${block.name}] ${JSON.stringify(block.input)}`;
  }

  if (block.type === "tool_result") {
    const content = block.content;
    if (
      is.string(content) ||
      is.plainObject(content) ||
      is.array(content, is.plainObject)
    ) {
      return stringifyToolResult(content);
    }
  }

  throw new Error("Unknown Claude content block type.");
}

export function claudeHistoryToolCall(
  toolId: string,
  toolName: string,
  input: ClaudeToolInput,
): ChatJsonObject {
  return {
    kind: acpHistoryToolKind(toolName, input),
    rawInput: input as ChatJsonObject,
    sessionUpdate: "tool_call",
    status: "in_progress",
    title: toolTitle(toolName, input),
    toolCallId: toolId,
  };
}

export function claudeHistoryToolResult(input: {
  content: object | object[] | string;
  input?: ClaudeToolInput;
  isError?: boolean;
  toolId: string;
  toolName?: string;
}): ChatJsonObject {
  if (!is.nonEmptyString(input.toolName)) {
    throw new Error("Claude history tool result is missing toolName.");
  }
  const toolName = input.toolName;
  const rawInput = input.input;
  const output = stringifyToolResult(input.content);
  if (input.isError && !output) {
    throw new Error("Claude history tool error is missing content.");
  }
  return {
    content: output,
    ...(input.isError ? { error: output } : {}),
    kind: acpHistoryToolKind(toolName, rawInput),
    ...(rawInput ? { rawInput: rawInput as ChatJsonObject } : {}),
    sessionUpdate: "tool_call_update",
    status: input.isError ? "failed" : "completed",
    title: rawInput ? toolTitle(toolName, rawInput) : toolName,
    toolCallId: input.toolId,
  };
}

function acpHistoryToolKind(toolName: string, input?: ClaudeToolInput): string {
  switch (actionKind(toolName, input)) {
    case EngineEventActionKind.Command:
      return "execute";
    case EngineEventActionKind.Read:
      return "read";
    case EngineEventActionKind.Write:
    case EngineEventActionKind.FileChange:
      return "edit";
    case EngineEventActionKind.WebSearch:
      return "search";
    case EngineEventActionKind.Reasoning:
    case EngineEventActionKind.Plan:
      return "think";
    default:
      return "fetch";
  }
}
