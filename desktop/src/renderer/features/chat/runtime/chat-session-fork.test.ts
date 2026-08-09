import type { ChatHistoryMessage } from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";
import { createForkSessionMessage, messagesThrough } from "./chat-session-fork";

const messages: ChatHistoryMessage[] = [
  {
    content: [{ text: "first", type: "text" }],
    id: "message-1",
    role: "user",
  },
  {
    content: [{ text: "第二条", type: "text" }],
    id: "message-2",
    role: "assistant",
  },
  {
    content: [{ text: "third", type: "text" }],
    id: "message-3",
    role: "user",
  },
];

describe("chat session fork", () => {
  it("keeps every message through the selected node", () => {
    expect(messagesThrough(messages, "message-2")).toEqual(
      messages.slice(0, 2),
    );
  });

  it("serializes the fork transcript as a JSON attachment", () => {
    const message = createForkSessionMessage(messages, "message-2", "chat-1");
    const attachmentPart = message.attachments?.[0]?.content[0];
    expect(attachmentPart?.type).toBe("file");
    if (attachmentPart?.type !== "file") throw new Error("Missing fork file");

    const transcript: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(attachmentPart.data), (value) =>
          value.charCodeAt(0),
        ),
      ),
    );
    expect(transcript).toEqual({
      forkedAtMessageId: "message-2",
      messages: messages.slice(0, 2),
      sourceChatId: "chat-1",
      version: 1,
    });
  });

  it("rejects an unknown fork node", () => {
    expect(() => messagesThrough(messages, "missing")).toThrow(
      "Cannot fork from missing message: missing",
    );
  });
});
