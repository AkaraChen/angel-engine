import type { DaemonHistoryMessage } from "@/platform/chat-types";

import { describe, expect, it } from "vitest";

import {
  partsToText,
  toConversation,
  toolCallFromAction,
  toolCallFromPart,
} from "./message-view";

function message(
  overrides: Partial<DaemonHistoryMessage> & Pick<DaemonHistoryMessage, "id">,
): DaemonHistoryMessage {
  return { role: "assistant", content: [], ...overrides };
}

describe("partsToText", () => {
  it("concatenates only parts of the requested type", () => {
    const parts = [
      { type: "reasoning", text: "thinking " },
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
      { type: "tool-call", text: "ignored" },
    ];
    expect(partsToText(parts, "text")).toBe("hello world");
    expect(partsToText(parts, "reasoning")).toBe("thinking ");
  });

  it("ignores parts without string text", () => {
    const parts = [{ type: "image" }, { type: "text", text: "kept" }];
    expect(partsToText(parts, "text")).toBe("kept");
  });
});

describe("toConversation", () => {
  it("projects user and assistant prose in order", () => {
    const result = toConversation([
      message({
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "hi" }],
      }),
      message({
        id: "a1",
        role: "assistant",
        content: [
          { type: "reasoning", text: "hmm" },
          { type: "text", text: "hello" },
        ],
      }),
    ]);
    expect(result.map((m) => [m.role, m.text])).toEqual([
      ["user", "hi"],
      ["assistant", "hello"],
    ]);
    expect(result[1].reasoning).toBe("hmm");
    expect(result[0].status).toBe("complete");
  });

  it("drops system messages", () => {
    const result = toConversation([
      message({
        id: "s1",
        role: "system",
        content: [{ type: "text", text: "you are an agent" }],
      }),
      message({
        id: "u1",
        role: "user",
        content: [{ type: "text", text: "hi" }],
      }),
    ]);
    expect(result.map((m) => m.id)).toEqual(["u1"]);
  });

  it("keeps empty user turns but drops content-less assistant turns", () => {
    const result = toConversation([
      message({ id: "u1", role: "user", content: [] }),
      message({
        id: "a1",
        role: "assistant",
        content: [{ type: "tool-call" }],
      }),
    ]);
    expect(result.map((m) => m.id)).toEqual(["u1"]);
  });

  it("keeps a pure tool-call assistant turn and projects its tool calls", () => {
    const result = toConversation([
      message({
        id: "a1",
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "t1",
            toolName: "bash",
            argsText: "ls -la",
            artifact: { id: "t1", phase: "completed", outputText: "file.ts" },
          },
        ],
      }),
    ]);
    expect(result.map((m) => m.id)).toEqual(["a1"]);
    expect(result[0].toolCalls).toEqual([
      {
        id: "t1",
        name: "bash",
        phase: "completed",
        argsText: "ls -la",
        outputText: "file.ts",
        errorText: "",
        isError: false,
      },
    ]);
  });
});

describe("toolCallFromPart", () => {
  it("prefers the artifact title and marks failures", () => {
    const call = toolCallFromPart({
      type: "tool-call",
      toolCallId: "t9",
      toolName: "write",
      isError: true,
      artifact: {
        id: "t9",
        phase: "failed",
        title: "Write file",
        inputSummary: "src/x.ts",
        rawInput: '{"path":"src/x.ts"}',
        error: { message: "permission denied" },
      },
    });
    expect(call).toMatchObject({
      id: "t9",
      name: "Write file",
      phase: "failed",
      argsText: '{"path":"src/x.ts"}',
      errorText: "permission denied",
      isError: true,
    });
  });

  it("returns null for a degenerate tool-call part", () => {
    expect(toolCallFromPart({ type: "tool-call" })).toBeNull();
  });
});

describe("toolCallFromAction", () => {
  it("projects a streamed action, defaulting the phase to running", () => {
    const call = toolCallFromAction({
      id: "a1",
      title: "Read file",
      inputSummary: "README.md",
    });
    expect(call).toMatchObject({
      id: "a1",
      name: "Read file",
      phase: "running",
      isError: false,
    });
  });
});
