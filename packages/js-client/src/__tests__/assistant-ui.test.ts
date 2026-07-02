import type { CompleteAttachment, ThreadMessage } from "@assistant-ui/react";
import type { ChatHistoryMessage, ChatToolAction } from "../types";

import { describe, expect, it } from "vitest";
import {
  assistantMessageToHistoryMessage,
  attachmentInputToHistoryPart,
  getAssistantMessageAttachments,
  getAssistantMessageText,
  historyMessageToAssistantMessage,
} from "../assistant-ui";
import { imageDataUrl } from "../utils";

function toolAction(overrides: Partial<ChatToolAction> = {}): ChatToolAction {
  return {
    error: overrides.error,
    id: overrides.id ?? "action-1",
    kind: overrides.kind ?? "command",
    output: overrides.output ?? [{ kind: "text", text: "done" }],
    outputText: overrides.outputText ?? "done",
    phase: overrides.phase ?? "completed",
    rawInput: overrides.rawInput ?? '{"cmd":"pwd"}',
    title: overrides.title ?? "Run command",
    turnId: overrides.turnId ?? "turn-1",
  };
}

describe("assistant-ui conversion", () => {
  it("round-trips assistant text, reasoning, and tool parts", () => {
    const action = toolAction();
    const history: ChatHistoryMessage = {
      content: [
        { text: "answer", type: "text" },
        { text: "thinking", type: "reasoning" },
        {
          args: { cmd: "pwd" },
          argsText: '{"cmd":"pwd"}',
          artifact: action,
          result: "done",
          toolCallId: "action-1",
          toolName: "command",
          type: "tool-call",
        },
      ],
      createdAt: "2026-07-02T00:00:00.000Z",
      id: "message-1",
      role: "assistant",
    };

    expect(
      assistantMessageToHistoryMessage(
        historyMessageToAssistantMessage(history),
      ).content,
    ).toEqual(history.content);
  });

  it("round-trips user image and file attachments", () => {
    const history: ChatHistoryMessage = {
      content: [
        { text: "see attached", type: "text" },
        {
          filename: "image.png",
          image: imageDataUrl("aW1hZ2U=", "image/png"),
          mimeType: "image/png",
          type: "image",
        },
        {
          data: "hello",
          filename: "note.txt",
          mimeType: "text/plain",
          type: "file",
        },
      ],
      id: "message-2",
      role: "user",
    };

    const assistant = historyMessageToAssistantMessage(history);

    expect(assistant.attachments).toHaveLength(2);
    expect(assistantMessageToHistoryMessage(assistant).content).toEqual(
      history.content,
    );
  });

  it("maps attachment inputs into history parts", () => {
    expect(() =>
      attachmentInputToHistoryPart({ path: "/tmp/a.txt", type: "fileMention" }),
    ).toThrow("File mention attachment is missing mimeType.");
    expect(
      attachmentInputToHistoryPart({
        data: "aW1hZ2U=",
        mimeType: "image/png",
        name: "image.png",
        type: "image",
      }),
    ).toEqual({
      filename: "image.png",
      image: imageDataUrl("aW1hZ2U=", "image/png"),
      mimeType: "image/png",
      type: "image",
    });
    expect(
      attachmentInputToHistoryPart({
        data: "hello",
        mimeType: "text/plain",
        name: "note.txt",
        type: "file",
      }),
    ).toEqual({
      data: "hello",
      filename: "note.txt",
      mimeType: "text/plain",
      type: "file",
    });
  });

  it("extracts assistant text and attachments", () => {
    const attachment: CompleteAttachment = {
      content: [
        {
          data: "hello",
          filename: "note.txt",
          mimeType: "text/plain",
          type: "file",
        },
      ],
      id: "attachment-1",
      name: "note.txt",
      status: { type: "complete" },
      type: "file",
    };
    const content: ThreadMessage["content"] = [
      { text: "one", type: "text" },
      { text: "two", type: "text" },
      {
        filename: "image.png",
        image: imageDataUrl("aW1hZ2U=", "image/png"),
        type: "image",
      },
    ];

    expect(getAssistantMessageText({ content })).toBe("one\ntwo\n");
    expect(
      getAssistantMessageAttachments({ attachments: [attachment], content }),
    ).toEqual([
      {
        data: "hello",
        mimeType: "text/plain",
        name: "note.txt",
        path: null,
        type: "file",
      },
      {
        data: "aW1hZ2U=",
        mimeType: "image/png",
        name: "image.png",
        path: null,
        type: "image",
      },
    ]);
  });
});
