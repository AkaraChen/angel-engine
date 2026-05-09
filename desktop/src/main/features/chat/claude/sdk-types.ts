import type {
  SDKAssistantMessage,
  SDKPartialAssistantMessage,
  SDKUserMessage,
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

export type ClaudeToolInputByName = {
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
};

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

type ClaudeUserContent =
  SDKUserMessage["message"]["content"] extends infer Content ? Content : never;
type ClaudeUserContentBlock = Extract<
  ClaudeUserContent,
  readonly unknown[]
>[number];
export type ClaudeUserToolResultBlock = Extract<
  ClaudeUserContentBlock,
  { type: "tool_result" }
>;

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
  return (
    Boolean(block) &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "tool_use"
  );
}

export function isClaudeUserToolResultBlock(
  block: unknown,
): block is ClaudeUserToolResultBlock {
  return (
    Boolean(block) &&
    typeof block === "object" &&
    (block as { type?: unknown }).type === "tool_result"
  );
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
