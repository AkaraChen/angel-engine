import type { ChatHistoryMessagePart, ChatToolAction } from "../types.js";
import { cloneChatElicitation } from "./elicitations.js";
import { cloneChatPlanData } from "./plans.js";

function appendTextPart(
  parts: ChatHistoryMessagePart[],
  type: "reasoning" | "text",
  text: string,
): void {
  if (!text) return;
  const last = parts.at(-1);
  if (last?.type === type) {
    last.text += text;
    return;
  }
  parts.push({ text, type });
}

export const appendChatTextPart = appendTextPart;

export function cloneChatHistoryPart(
  part: ChatHistoryMessagePart,
): ChatHistoryMessagePart {
  switch (part.type) {
    case "tool-call":
      return {
        ...part,
        artifact: cloneChatToolAction(part.artifact),
      };
    case "image":
    case "file":
    case "reasoning":
    case "text":
      return { ...part };
    case "data":
      if (part.name === "elicitation") {
        return {
          ...part,
          data: cloneChatElicitation(part.data),
        };
      }
      return {
        ...part,
        data: cloneChatPlanData(part.data),
      };
  }
}

export function chatPartsText(
  parts: ChatHistoryMessagePart[],
  type: "reasoning" | "text",
): string {
  return parts.reduce(
    (text, part) => (part.type === type ? text + part.text : text),
    "",
  );
}

function cloneChatToolAction(action: ChatToolAction): ChatToolAction {
  return {
    ...action,
    error: action.error ? { ...action.error } : action.error,
    output: action.output.map((item) => ({ ...item })),
  };
}
