import type {
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AgentInput,
  AskUserQuestionInput,
  BashInput,
  ExitPlanModeInput,
  FileEditInput,
  FileReadInput,
  FileWriteInput,
  GlobInput,
  GrepInput,
  TodoWriteInput,
  WebFetchInput,
  WebSearchInput,
} from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import is from "@sindresorhus/is";

export const CLAUDE_TOOL = {
  Agent: "Agent",
  AskUserQuestion: "AskUserQuestion",
  Bash: "Bash",
  Edit: "Edit",
  ExitPlanMode: "ExitPlanMode",
  Glob: "Glob",
  Grep: "Grep",
  LS: "LS",
  MultiEdit: "MultiEdit",
  Read: "Read",
  Task: "Task",
  TodoWrite: "TodoWrite",
  WebFetch: "WebFetch",
  WebSearch: "WebSearch",
  Write: "Write",
} as const;

export type ClaudeToolName = (typeof CLAUDE_TOOL)[keyof typeof CLAUDE_TOOL];

export type ClaudeExitPlanModeInput = ExitPlanModeInput & {
  plan?: unknown;
  planFilePath?: unknown;
};

export interface ClaudeToolInputByName {
  [CLAUDE_TOOL.Agent]: AgentInput;
  [CLAUDE_TOOL.AskUserQuestion]: AskUserQuestionInput;
  [CLAUDE_TOOL.Bash]: BashInput;
  [CLAUDE_TOOL.Edit]: FileEditInput;
  [CLAUDE_TOOL.ExitPlanMode]: ClaudeExitPlanModeInput;
  [CLAUDE_TOOL.Glob]: GlobInput;
  [CLAUDE_TOOL.Grep]: GrepInput;
  [CLAUDE_TOOL.LS]: { path?: string };
  [CLAUDE_TOOL.MultiEdit]: Record<string, unknown>;
  [CLAUDE_TOOL.Read]: FileReadInput;
  [CLAUDE_TOOL.Task]: AgentInput;
  [CLAUDE_TOOL.TodoWrite]: TodoWriteInput;
  [CLAUDE_TOOL.WebFetch]: WebFetchInput;
  [CLAUDE_TOOL.WebSearch]: WebSearchInput;
  [CLAUDE_TOOL.Write]: FileWriteInput;
}

export type ClaudeAskUserQuestionInput =
  ClaudeToolInputByName[typeof CLAUDE_TOOL.AskUserQuestion];
export type ClaudeQuestionInput =
  ClaudeAskUserQuestionInput["questions"][number];
export type ClaudeFileWriteInput =
  ClaudeToolInputByName[typeof CLAUDE_TOOL.Write];
export type ClaudeTodoWriteInput =
  ClaudeToolInputByName[typeof CLAUDE_TOOL.TodoWrite];

type ClaudeAssistantContentBlock =
  SDKAssistantMessage["message"]["content"][number];
export type ClaudeAssistantToolUseBlock = Extract<
  ClaudeAssistantContentBlock,
  { type: "tool_use" }
>;

export interface ClaudeUserToolResultBlock {
  content: object | readonly object[] | string | null | undefined;
  is_error?: boolean;
  tool_use_id: string;
  type: "tool_result";
}

export type ClaudeStreamEvent = SDKPartialAssistantMessage["event"];
export type ClaudeContentBlockStartEvent = Extract<
  ClaudeStreamEvent,
  { type: "content_block_start" }
>;
export type ClaudeContentBlockDeltaEvent = Extract<
  ClaudeStreamEvent,
  { type: "content_block_delta" }
>;

export function typedClaudeInput<T extends keyof ClaudeToolInputByName>(
  toolName: string,
  input: Record<string, unknown>,
  expected: T,
): ClaudeToolInputByName[T] | undefined {
  return toolName === expected
    ? (input as ClaudeToolInputByName[T])
    : undefined;
}

export function isClaudeAssistantToolUseBlock(
  block: unknown,
): block is ClaudeAssistantToolUseBlock {
  return is.plainObject(block) && block.type === "tool_use";
}

export function isClaudeUserToolResultBlock(
  block: unknown,
): block is ClaudeUserToolResultBlock {
  return is.plainObject(block) && block.type === "tool_result";
}

export function isClaudeContentBlockStartEvent(
  event: ClaudeStreamEvent,
): event is ClaudeContentBlockStartEvent {
  return event.type === "content_block_start";
}

export function isClaudeContentBlockDeltaEvent(
  event: ClaudeStreamEvent,
): event is ClaudeContentBlockDeltaEvent {
  return event.type === "content_block_delta";
}
