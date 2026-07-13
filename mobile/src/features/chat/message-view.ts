import type {
  ConversationMessage,
  DaemonHistoryMessage,
  DaemonMessagePart,
} from "@/platform/chat-types";

/**
 * Derives the mobile conversation view model from the daemon's history shape.
 *
 * The daemon message is a list of typed parts (text, reasoning, tool calls,
 * plans, …), but the mobile conversation only renders prose: this flattens the
 * `text` and `reasoning` parts into strings and drops the rest. Keeping the
 * projection pure (no React, no client) makes the streaming reducer and the
 * page trivial to test.
 */

/** Concatenate the text of every part with the given `type`. */
export function partsToText(
  parts: DaemonMessagePart[],
  type: "reasoning" | "text",
): string {
  return parts
    .filter((part) => part.type === type && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

/** Project a single daemon history message into a rendered conversation row. */
export function toConversationMessage(
  message: DaemonHistoryMessage,
): ConversationMessage {
  return {
    id: message.id,
    role: message.role,
    text: partsToText(message.content, "text"),
    reasoning: partsToText(message.content, "reasoning"),
    status: "complete",
  };
}

/**
 * Project the daemon history into conversation rows, dropping `system` messages
 * (agent bootstrap prompts) and any assistant turn that produced no visible
 * prose (e.g. a pure tool-call turn) so the mobile transcript stays readable.
 */
export function toConversation(
  messages: DaemonHistoryMessage[],
): ConversationMessage[] {
  return messages
    .filter((message) => message.role !== "system")
    .map(toConversationMessage)
    .filter(
      (message) =>
        message.role === "user" ||
        message.text.length > 0 ||
        message.reasoning.length > 0,
    );
}
