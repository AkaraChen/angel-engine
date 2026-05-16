import { type } from "arktype";
import type { ChatElicitation, ChatHistoryMessagePart } from "../types.js";

const chatElicitationQuestionOption = type({
  "description?": "string",
  label: "string",
});

const chatElicitationQuestion = type({
  "header?": "string",
  id: "string",
  "isOther?": "boolean",
  "isSecret?": "boolean",
  "options?": chatElicitationQuestionOption.array(),
  "question?": "string",
});

const chatElicitation = type({
  "actionId?": "string | null",
  "body?": "string | null",
  "choices?": "string[]",
  id: "string",
  kind: "string",
  phase: "string",
  "questions?": chatElicitationQuestion.array(),
  "title?": "string | null",
  "turnId?": "string | null",
});

export function isChatElicitationData(
  value: unknown,
): value is ChatElicitation {
  return !(chatElicitation(value) instanceof type.errors);
}

export function cloneChatElicitation(data: ChatElicitation): ChatElicitation {
  return {
    ...data,
    choices: data.choices ? [...data.choices] : data.choices,
    questions: data.questions?.map((question) => ({
      ...question,
      options: question.options?.map((option) => ({ ...option })),
    })),
  };
}

export function upsertChatElicitationPart(
  parts: ChatHistoryMessagePart[],
  elicitation: ChatElicitation,
): void {
  const nextPart: ChatHistoryMessagePart = {
    data: cloneChatElicitation(elicitation),
    name: "elicitation",
    type: "data",
  };
  const index = parts.findIndex(
    (part) =>
      part.type === "data" &&
      part.name === "elicitation" &&
      part.data.id === elicitation.id,
  );

  if (index === -1) {
    parts.push(nextPart);
    return;
  }

  parts[index] = nextPart;
}
