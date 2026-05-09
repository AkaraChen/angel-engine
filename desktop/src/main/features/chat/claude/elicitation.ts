import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

import type { ChatElicitationResponse } from "../../../../shared/chat";
import type { JsonObject } from "./types";
import {
  CLAUDE_TOOL,
  typedClaudeInput,
  type ClaudeAskUserQuestionInput,
  type ClaudeQuestionInput,
} from "./sdk-types";

type CanUseToolContext = Parameters<CanUseTool>[2];
type NormalizedClaudeQuestionInput = {
  header: string;
  multiSelect: boolean;
  options: Array<{ description: string; label: string }>;
  question: string;
};

export function claudeElicitationKind(
  toolName: string,
  input: Record<string, unknown>,
): "Approval" | "UserInput" {
  return askUserQuestionInput(toolName, input) ? "UserInput" : "Approval";
}

export function claudeElicitationBody(
  toolName: string,
  input: Record<string, unknown>,
  context: CanUseToolContext,
  fallback: string,
): string | null {
  if (askUserQuestionInput(toolName, input)) {
    return context.description ?? context.decisionReason ?? null;
  }
  return context.description ?? context.decisionReason ?? fallback;
}

export function claudeElicitationChoices(
  toolName: string,
  input: Record<string, unknown>,
): string[] {
  return askUserQuestionInput(toolName, input)
    ? []
    : ["Allow", "Allow for session", "Deny"];
}

export function claudeElicitationQuestions(
  toolName: string,
  input: Record<string, unknown>,
): JsonObject[] {
  return questionInputs(toolName, input).map((question, index) => ({
    header: question.header,
    id: questionId(index),
    is_other: true,
    is_secret: false,
    options: question.options,
    question: question.question,
    schema: {
      constraints: question.multiSelect
        ? { max_items: "4", min_items: "1", unique_items: true }
        : {},
      default_value: null,
      format: null,
      item_value_type: question.multiSelect ? "String" : null,
      multiple: question.multiSelect,
      raw_schema: JSON.stringify(question),
      required: true,
      value_type: question.multiSelect ? "Array" : "String",
    },
  }));
}

export function updatedInputFromElicitationResponse(
  toolName: string,
  input: Record<string, unknown>,
  response: ChatElicitationResponse,
): Record<string, unknown> {
  if (response.type !== "answers") return input;
  const questions = questionInputs(toolName, input);
  const answers: Record<string, string> = {};
  for (const answer of response.answers) {
    const index = questionIndex(answer.id);
    const question = index === undefined ? undefined : questions[index];
    answers[question?.question ?? answer.id] = answer.value;
  }
  return { ...input, answers };
}

function askUserQuestionInput(
  toolName: string,
  input: Record<string, unknown>,
): ClaudeAskUserQuestionInput | undefined {
  return typedClaudeInput(toolName, input, CLAUDE_TOOL.AskUserQuestion);
}

function questionInputs(
  toolName: string,
  input: Record<string, unknown>,
): NormalizedClaudeQuestionInput[] {
  return [...(askUserQuestionInput(toolName, input)?.questions ?? [])]
    .map((question) => ({
      header: String(question.header ?? ""),
      multiSelect: Boolean(question.multiSelect),
      options: questionOptions(question.options),
      question: String(question.question ?? ""),
    }))
    .filter((question) => question.question.trim());
}

function questionOptions(
  value: ClaudeQuestionInput["options"],
): NormalizedClaudeQuestionInput["options"] {
  return [...value]
    .map((option) => ({
      description: String(option.description ?? ""),
      label: String(option.label ?? ""),
    }))
    .filter((option) => option.label.trim());
}

function questionId(index: number): string {
  return `question-${index}`;
}

function questionIndex(id: string): number | undefined {
  const match = id.match(/^question-(\d+)$/);
  if (!match) return undefined;
  return Number(match[1]);
}
