import type { ActiveClaudeTurn, JsonObject } from "./types";
import { CLAUDE_TOOL } from "./sdk-types";
import { isClaudePlanToolUse } from "./plan";
import { asObject } from "./utils";

export function actionKind(
  toolName: string,
  input?: Record<string, unknown>,
): string {
  if (isClaudePlanToolUse(toolName, input)) return "Plan";

  switch (toolName) {
    case CLAUDE_TOOL.Bash:
      return "Command";
    case CLAUDE_TOOL.Read:
    case CLAUDE_TOOL.Glob:
    case CLAUDE_TOOL.Grep:
    case CLAUDE_TOOL.LS:
      return "Read";
    case CLAUDE_TOOL.Write:
      return "Write";
    case CLAUDE_TOOL.Edit:
    case CLAUDE_TOOL.MultiEdit:
      return "FileChange";
    case CLAUDE_TOOL.WebSearch:
    case CLAUDE_TOOL.WebFetch:
      return "WebSearch";
    case CLAUDE_TOOL.Task:
    case CLAUDE_TOOL.Agent:
      return "SubAgent";
    case CLAUDE_TOOL.AskUserQuestion:
      return "HostCapability";
    default:
      return "DynamicTool";
  }
}

export function toolOutputKind(
  actionId: string,
  output: string,
  active: ActiveClaudeTurn,
): string {
  if (!active.actionIds.has(actionId)) return "Text";
  return output.includes("\n") ? "Terminal" : "Text";
}

export function toolTitle(
  toolName: string,
  input: Record<string, unknown>,
): string {
  if (toolName === CLAUDE_TOOL.Bash && typeof input.command === "string") {
    return input.command;
  }
  if (typeof input.file_path === "string")
    return `${toolName} ${input.file_path}`;
  if (typeof input.path === "string") return `${toolName} ${input.path}`;
  if (typeof input.planFilePath === "string")
    return `${toolName} ${input.planFilePath}`;
  return toolName;
}

export function toolInputSummary(
  toolName: string,
  input: Record<string, unknown>,
): string {
  if (toolName === CLAUDE_TOOL.Bash && typeof input.command === "string") {
    return input.command;
  }
  if (typeof input.description === "string") return input.description;
  if (typeof input.prompt === "string") return input.prompt;
  if (typeof input.file_path === "string") return input.file_path;
  if (typeof input.path === "string") return input.path;
  if (typeof input.plan === "string") return input.plan;
  return JSON.stringify(input);
}

export function stringifyToolResult(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(contentBlockText).filter(Boolean).join("\n");
  }
  if (value === undefined || value === null) return "";
  return JSON.stringify(value);
}

export function contentBlockText(block: unknown): string {
  const value = asObject(block);
  if (!value) return "";
  if (value.type === "text") return String(value.text ?? "");
  if (value.type === "thinking") return String(value.thinking ?? "");
  if (value.type === "tool_use") {
    return `[${String(value.name ?? "tool")}] ${JSON.stringify(value.input ?? {})}`;
  }
  if (value.type === "tool_result") return stringifyToolResult(value.content);
  return "";
}

export function claudeHistoryToolCall(
  toolId: string,
  toolName: string,
  input: JsonObject,
): JsonObject {
  return {
    kind: acpHistoryToolKind(toolName, input),
    rawInput: input,
    sessionUpdate: "tool_call",
    status: "in_progress",
    title: toolTitle(toolName, input),
    toolCallId: toolId,
  };
}

export function claudeHistoryToolResult(input: {
  content: unknown;
  input?: JsonObject;
  isError?: boolean;
  toolId: string;
  toolName?: string;
}): JsonObject {
  const toolName = input.toolName ?? "tool";
  const output = stringifyToolResult(input.content);
  return {
    content: output,
    error: input.isError
      ? output || "Claude Code tool call failed."
      : undefined,
    kind: acpHistoryToolKind(toolName, input.input),
    rawInput: input.input,
    sessionUpdate: "tool_call_update",
    status: input.isError ? "failed" : "completed",
    title: toolTitle(toolName, input.input ?? {}),
    toolCallId: input.toolId,
  };
}

function acpHistoryToolKind(
  toolName: string,
  input?: Record<string, unknown>,
): string {
  switch (actionKind(toolName, input)) {
    case "Command":
      return "execute";
    case "Read":
      return "read";
    case "Write":
    case "FileChange":
      return "edit";
    case "WebSearch":
      return "search";
    case "Reasoning":
    case "Plan":
      return "think";
    default:
      return "fetch";
  }
}
