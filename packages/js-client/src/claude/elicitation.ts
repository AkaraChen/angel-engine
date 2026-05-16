import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";

import type {
  ClaudeAskUserQuestionInput,
  ClaudeQuestionInput,
} from "./sdk-types.js";
import type { ClaudeElicitationResponse } from "./types.js";
import type { JsonObject } from "./types.js";
import { EngineEventElicitationKind } from "@angel-engine/client-napi";
import is from "@sindresorhus/is";
import { CLAUDE_TOOL, typedClaudeInput } from "./sdk-types.js";

type CanUseToolContext = Parameters<CanUseTool>[2];
interface NormalizedClaudeQuestionInput {
  header: string;
  multiSelect: boolean;
  options: Array<{ description: string; label: string }>;
  question: string;
}

export function claudeElicitationKind(
  toolName: string,
  input: Record<string, unknown>,
): `${EngineEventElicitationKind}` {
  return askUserQuestionInput(toolName, input)
    ? EngineEventElicitationKind.UserInput
    : EngineEventElicitationKind.Approval;
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
  return questionInputs(toolName, input).map((question, index) => {
    const constraints: JsonObject = question.multiSelect
      ? { max_items: "4", min_items: "1", unique_items: true }
      : {};
    return {
      header: question.header,
      id: questionId(index),
      is_other: true,
      is_secret: false,
      options: question.options,
      question: question.question,
      schema: {
        constraints,
        default_value: null,
        format: null,
        item_value_type: question.multiSelect ? "String" : null,
        multiple: question.multiSelect,
        raw_schema: JSON.stringify(question),
        required: true,
        value_type: question.multiSelect ? "Array" : "String",
      },
    };
  });
}

export function updatedInputFromElicitationResponse(
  toolName: string,
  input: Record<string, unknown>,
  response: ClaudeElicitationResponse,
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
  const askInput = askUserQuestionInput(toolName, input);
  if (!askInput) return [];
  return askInput.questions
    .map((input) => {
      if (!is.string(input.header)) {
        throw new Error("Claude AskUserQuestion header is missing.");
      }
      if (!is.string(input.question)) {
        throw new Error("Claude AskUserQuestion question is missing.");
      }
      return {
        header: input.header,
        multiSelect: input.multiSelect === true,
        options: questionOptions(input.options),
        question: input.question,
      };
    })
    .filter((question) => question.question);
}

function questionOptions(
  value: ClaudeQuestionInput["options"],
): NormalizedClaudeQuestionInput["options"] {
  return [...value]
    .map((option) => {
      if (!is.string(option.description)) {
        throw new Error(
          "Claude AskUserQuestion option description is missing.",
        );
      }
      if (!is.string(option.label)) {
        throw new Error("Claude AskUserQuestion option label is missing.");
      }
      return {
        description: option.description,
        label: option.label,
      };
    })
    .filter((option) => option.label);
}

function questionId(index: number): string {
  return `question-${index}`;
}

function questionIndex(id: string): number | undefined {
  const match = id.match(/^question-(\d+)$/);
  if (!match) return undefined;
  return Number(match[1]);
}
