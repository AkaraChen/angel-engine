import {
  EngineEventActionKind,
  EngineEventActionOutputKind,
} from "@angel-engine/client-napi";
import is from "@sindresorhus/is";

export type PiToolInput = Record<string, unknown>;

export function actionKind(toolName: string): `${EngineEventActionKind}` {
  switch (toolName) {
    case "bash":
      return EngineEventActionKind.Command;
    case "read":
    case "grep":
    case "find":
    case "ls":
      return EngineEventActionKind.Read;
    case "write":
      return EngineEventActionKind.Write;
    case "edit":
      return EngineEventActionKind.FileChange;
    default:
      return EngineEventActionKind.DynamicTool;
  }
}

export function toolOutputKind(
  toolName: string,
): `${EngineEventActionOutputKind}` {
  return toolName === "bash"
    ? EngineEventActionOutputKind.Terminal
    : EngineEventActionOutputKind.Text;
}

export function toolTitle(toolName: string, input?: PiToolInput): string {
  if (toolName === "bash" && input && is.string(input.command)) {
    return input.command;
  }
  if (input && is.string(input.path)) return `${toolName} ${input.path}`;
  if (input && is.string(input.file_path)) {
    return `${toolName} ${input.file_path}`;
  }
  if (input && is.string(input.pattern)) return `${toolName} ${input.pattern}`;
  return toolName;
}

export function toolInputSummary(toolName: string, input: PiToolInput): string {
  if (toolName === "bash" && is.string(input.command)) return input.command;
  if (is.string(input.description)) return input.description;
  if (is.string(input.query)) return input.query;
  if (is.string(input.pattern)) return input.pattern;
  if (is.string(input.path)) return input.path;
  if (is.string(input.file_path)) return input.file_path;
  return stringifyJson(input);
}

export function normalizeToolInput(value: unknown): PiToolInput {
  if (!is.plainObject(value)) {
    throw new Error("Pi tool input must be an object.");
  }
  return value;
}

export function stringifyToolResult(value: unknown): string {
  if (!is.plainObject(value)) {
    throw new Error("Pi tool result must be an object.");
  }
  const content = value.content;
  if (!is.array(content, is.plainObject)) {
    throw new Error("Pi tool result content must be an array.");
  }
  return content
    .map((block) => contentBlockText(block))
    .filter(Boolean)
    .join("\n");
}

export function contentBlockText(block: unknown): string {
  if (!is.plainObject(block)) {
    throw new Error("Pi content block must be an object.");
  }
  if (block.type === "text" && is.string(block.text)) return block.text;
  if (block.type === "image") {
    const mimeType = is.string(block.mimeType) ? block.mimeType : "image";
    return `[image ${mimeType}]`;
  }
  throw new Error("Unknown Pi content block type.");
}

export function stringifyJson(value: unknown): string {
  const text = JSON.stringify(value);
  if (!is.string(text)) throw new Error("Pi value is not JSON-serializable.");
  return text;
}

export function piHistoryToolCall(
  toolId: string,
  toolName: string,
  input: PiToolInput,
): object {
  return {
    kind: actionKind(toolName),
    rawInput: input,
    sessionUpdate: "tool_call",
    status: "in_progress",
    title: toolTitle(toolName, input),
    toolCallId: toolId,
  };
}

export function piHistoryToolResult(input: {
  content: unknown;
  isError: boolean;
  toolId: string;
  toolName: string;
}): object {
  return {
    kind: actionKind(input.toolName),
    rawOutput: stringifyToolResult({ content: input.content }),
    sessionUpdate: "tool_call_update",
    status: input.isError ? "failed" : "completed",
    title: input.toolName,
    toolCallId: input.toolId,
  };
}
