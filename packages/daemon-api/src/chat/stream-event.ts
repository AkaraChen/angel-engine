import is from "@sindresorhus/is";

import type {
  Chat,
  ChatElicitation,
  ChatElicitationQuestion,
  ChatHistoryMessagePart,
  ChatJsonObject,
  ChatJsonValue,
  ChatPlanData,
  ChatRuntimeConfig,
  ChatRuntimeConfigOption,
  ChatSendResult,
  ChatStreamEvent,
  ChatToolAction,
  ChatToolActionError,
  ChatToolActionOutput,
} from "./index";

type BoundaryRecord = Record<string, unknown>;

const TOOL_ACTION_KINDS = [
  "command",
  "fileChange",
  "read",
  "write",
  "mcpTool",
  "dynamicTool",
  "subAgent",
  "webSearch",
  "media",
  "reasoning",
  "plan",
  "hostCapability",
] as const satisfies readonly ChatToolAction["kind"][];

const TOOL_ACTION_PHASES = [
  "proposed",
  "awaitingDecision",
  "running",
  "streamingResult",
  "completed",
  "failed",
  "declined",
  "cancelled",
] as const satisfies readonly ChatToolAction["phase"][];

const TOOL_OUTPUT_KINDS = [
  "text",
  "patch",
  "terminal",
  "structured",
] as const satisfies readonly ChatToolActionOutput["kind"][];

const ELICITATION_KINDS = [
  "approval",
  "userInput",
  "externalFlow",
  "dynamicToolCall",
  "permissionProfile",
] as const satisfies readonly ChatElicitation["kind"][];

const PLAN_KINDS = ["review", "todo"] as const satisfies readonly NonNullable<
  ChatPlanData["kind"]
>[];

const PLAN_PRESENTATIONS = [
  "created",
  "updated",
] as const satisfies readonly NonNullable<ChatPlanData["presentation"]>[];

const PLAN_STATUSES = [
  "pending",
  "in_progress",
  "completed",
] as const satisfies readonly ChatPlanData["entries"][number]["status"][];

function isBoundaryRecord(value: unknown): value is BoundaryRecord {
  return is.plainObject(value);
}

function isOneOf<T extends string>(
  value: unknown,
  choices: readonly T[],
): value is T {
  return (
    typeof value === "string" &&
    choices.some((candidate) => candidate === value)
  );
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isOptionalNullableString(
  value: unknown,
): value is string | null | undefined {
  return value === undefined || isNullableString(value);
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isChat(value: unknown): value is Chat {
  if (!isBoundaryRecord(value)) return false;
  return (
    typeof value.archived === "boolean" &&
    typeof value.createdAt === "string" &&
    isNullableString(value.cwd) &&
    typeof value.id === "string" &&
    typeof value.pinned === "boolean" &&
    isNullableString(value.projectId) &&
    isNullableString(value.remoteThreadId) &&
    typeof value.runtime === "string" &&
    typeof value.title === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isChatJsonValue(value: unknown): value is ChatJsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isChatJsonValue);
  if (!isBoundaryRecord(value)) return false;
  return Object.values(value).every(isChatJsonValue);
}

function isChatJsonObject(value: unknown): value is ChatJsonObject {
  return isBoundaryRecord(value) && Object.values(value).every(isChatJsonValue);
}

function isToolActionOutput(value: unknown): value is ChatToolActionOutput {
  if (!isBoundaryRecord(value)) return false;
  return (
    isOneOf(value.kind, TOOL_OUTPUT_KINDS) && typeof value.text === "string"
  );
}

function isToolActionError(value: unknown): value is ChatToolActionError {
  if (!isBoundaryRecord(value)) return false;
  return (
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.recoverable === "boolean"
  );
}

function isToolAction(value: unknown): value is ChatToolAction {
  if (!isBoundaryRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.turnId === "string" &&
    isOptionalString(value.elicitationId) &&
    isOneOf(value.kind, TOOL_ACTION_KINDS) &&
    isOneOf(value.phase, TOOL_ACTION_PHASES) &&
    isOptionalString(value.title) &&
    isOptionalString(value.inputSummary) &&
    isOptionalString(value.rawInput) &&
    Array.isArray(value.output) &&
    value.output.every(isToolActionOutput) &&
    typeof value.outputText === "string" &&
    (value.error === undefined || isToolActionError(value.error))
  );
}

function isPlanData(value: unknown): value is ChatPlanData {
  if (!isBoundaryRecord(value)) return false;
  if (typeof value.text !== "string" || !Array.isArray(value.entries)) {
    return false;
  }
  if (
    !value.entries.every(
      (entry) =>
        isBoundaryRecord(entry) &&
        typeof entry.content === "string" &&
        isOneOf(entry.status, PLAN_STATUSES),
    )
  ) {
    return false;
  }
  return (
    (value.kind === undefined ||
      value.kind === null ||
      isOneOf(value.kind, PLAN_KINDS)) &&
    isOptionalNullableString(value.path) &&
    (value.presentation === undefined ||
      value.presentation === null ||
      isOneOf(value.presentation, PLAN_PRESENTATIONS))
  );
}

function isQuestionOption(value: unknown): boolean {
  if (!isBoundaryRecord(value)) return false;
  return typeof value.label === "string" && isOptionalString(value.description);
}

function isQuestionConstraints(value: unknown): boolean {
  if (!isBoundaryRecord(value)) return false;
  return (
    isOptionalString(value.pattern) &&
    isOptionalString(value.minimum) &&
    isOptionalString(value.maximum) &&
    isOptionalString(value.minLength) &&
    isOptionalString(value.maxLength) &&
    isOptionalString(value.minItems) &&
    isOptionalString(value.maxItems) &&
    isOptionalBoolean(value.uniqueItems)
  );
}

function isQuestionSchema(value: unknown): boolean {
  if (!isBoundaryRecord(value)) return false;
  return (
    typeof value.valueType === "string" &&
    isOptionalNullableString(value.itemValueType) &&
    typeof value.required === "boolean" &&
    typeof value.multiple === "boolean" &&
    isOptionalString(value.format) &&
    isOptionalString(value.defaultValue) &&
    isQuestionConstraints(value.constraints) &&
    isOptionalString(value.rawSchema)
  );
}

function isElicitationQuestion(
  value: unknown,
): value is ChatElicitationQuestion {
  if (!isBoundaryRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isOptionalString(value.header) &&
    isOptionalString(value.question) &&
    isOptionalBoolean(value.isSecret) &&
    isOptionalBoolean(value.isOther) &&
    (value.options === undefined ||
      (Array.isArray(value.options) &&
        value.options.every(isQuestionOption))) &&
    (value.schema === undefined || isQuestionSchema(value.schema))
  );
}

function isElicitation(value: unknown): value is ChatElicitation {
  if (!isBoundaryRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    isOneOf(value.kind, ELICITATION_KINDS) &&
    typeof value.phase === "string" &&
    isOptionalNullableString(value.actionId) &&
    isOptionalNullableString(value.body) &&
    isOptionalNullableString(value.title) &&
    isOptionalNullableString(value.turnId) &&
    (value.choices === undefined || isStringArray(value.choices)) &&
    (value.questions === undefined ||
      (Array.isArray(value.questions) &&
        value.questions.every(isElicitationQuestion)))
  );
}

function isRuntimeConfigOption(
  value: unknown,
): value is ChatRuntimeConfigOption {
  if (!isBoundaryRecord(value)) return false;
  return (
    typeof value.label === "string" &&
    typeof value.value === "string" &&
    isOptionalNullableString(value.description)
  );
}

function isRuntimeConfigOptionArray(
  value: unknown,
): value is ChatRuntimeConfigOption[] {
  return Array.isArray(value) && value.every(isRuntimeConfigOption);
}

function isRuntimeConfig(value: unknown): value is ChatRuntimeConfig {
  if (!isBoundaryRecord(value)) return false;
  const agentState = value.agentState;
  const availableCommands = value.availableCommands;
  return (
    (agentState === undefined ||
      (isBoundaryRecord(agentState) &&
        isOptionalNullableString(agentState.currentMode) &&
        isOptionalNullableString(agentState.currentPermissionMode))) &&
    (availableCommands === undefined ||
      (Array.isArray(availableCommands) &&
        availableCommands.every(
          (command) =>
            isBoundaryRecord(command) &&
            typeof command.name === "string" &&
            typeof command.description === "string" &&
            isOptionalNullableString(command.inputHint),
        ))) &&
    isOptionalBoolean(value.canSetMode) &&
    isOptionalBoolean(value.canSetModel) &&
    isOptionalBoolean(value.canSetPermissionMode) &&
    isOptionalBoolean(value.canSetReasoningEffort) &&
    isOptionalNullableString(value.currentMode) &&
    isOptionalNullableString(value.currentModel) &&
    isOptionalNullableString(value.currentPermissionMode) &&
    isOptionalNullableString(value.currentReasoningEffort) &&
    isRuntimeConfigOptionArray(value.modes) &&
    isRuntimeConfigOptionArray(value.models) &&
    isRuntimeConfigOptionArray(value.permissionModes) &&
    isRuntimeConfigOptionArray(value.reasoningEfforts)
  );
}

function isChatErrorData(value: unknown): boolean {
  if (!isBoundaryRecord(value)) return false;
  return (
    value.type === "chat-error" &&
    value.source === "runtime" &&
    typeof value.message === "string"
  );
}

function isHistoryMessagePart(value: unknown): value is ChatHistoryMessagePart {
  if (!isBoundaryRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "reasoning":
    case "text":
      return typeof value.text === "string";
    case "image":
      return (
        typeof value.image === "string" &&
        isOptionalString(value.filename) &&
        isOptionalString(value.mimeType)
      );
    case "file":
      return (
        typeof value.data === "string" &&
        typeof value.mimeType === "string" &&
        isOptionalString(value.filename) &&
        isOptionalBoolean(value.mention) &&
        isOptionalNullableString(value.path)
      );
    case "data":
      switch (value.name) {
        case "plan":
        case "todo":
          return isPlanData(value.data);
        case "elicitation":
          return isElicitation(value.data);
        case "chat-error":
          return isChatErrorData(value.data);
        default:
          return false;
      }
    case "tool-call":
      return (
        isChatJsonObject(value.args) &&
        typeof value.argsText === "string" &&
        isToolAction(value.artifact) &&
        isOptionalBoolean(value.isError) &&
        (value.result === undefined || isChatJsonValue(value.result)) &&
        typeof value.toolCallId === "string" &&
        typeof value.toolName === "string"
      );
    default:
      return false;
  }
}

function isSendResult(value: unknown): value is ChatSendResult {
  if (!isBoundaryRecord(value)) return false;
  return (
    isChat(value.chat) &&
    typeof value.chatId === "string" &&
    (value.config === undefined || isRuntimeConfig(value.config)) &&
    Array.isArray(value.content) &&
    value.content.every(isHistoryMessagePart) &&
    isOptionalString(value.model) &&
    isOptionalString(value.reasoning) &&
    typeof value.text === "string" &&
    isOptionalString(value.turnId)
  );
}

/**
 * Validate one JSON-decoded event at the daemon-client SSE trust boundary.
 *
 * The discriminants intentionally use the same closed sets as the upstream
 * generated contract. Unknown event, action, phase, elicitation, plan, or
 * content-part values fail here instead of leaking into UI state.
 */
export function isChatStreamEvent(value: unknown): value is ChatStreamEvent {
  if (!isBoundaryRecord(value) || typeof value.type !== "string") return false;

  switch (value.type) {
    case "chat":
      return isChat(value.chat);
    case "delta":
      return (
        isOneOf(value.part, ["reasoning", "text"]) &&
        typeof value.text === "string" &&
        isOptionalString(value.turnId)
      );
    case "plan":
      return isPlanData(value.plan) && isOptionalString(value.turnId);
    case "elicitation":
      return isElicitation(value.elicitation);
    case "tool":
    case "toolDelta":
      return isToolAction(value.action);
    case "result":
      return isSendResult(value.result);
    case "error":
      return typeof value.message === "string";
    case "done":
      return true;
    default:
      return false;
  }
}
