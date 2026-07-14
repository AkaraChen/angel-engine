import type {
  ConversationToolCall,
  DaemonHistoryMessage,
} from "@/platform/chat-types";

import { describe, expect, it } from "vitest";

import {
  formatToolPhase,
  partsToText,
  toConversation,
  toolCallFromAction,
  toolCallFromPart,
  toolGroupLabel,
} from "./message-view";

function toolCall(
  overrides: Partial<ConversationToolCall> = {},
): ConversationToolCall {
  return {
    id: "t",
    name: "bash",
    summary: "",
    phase: "completed",
    argsText: "",
    outputText: "",
    errorText: "",
    isError: false,
    ...overrides,
  };
}

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
        summary: "",
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
  it("renders the tool identifier as the name with the title as summary", () => {
    const call = toolCallFromPart({
      type: "tool-call",
      toolCallId: "t9",
      toolName: "write",
      isError: true,
      artifact: {
        id: "t9",
        phase: "failed",
        kind: "fileChange",
        title: "Write file",
        inputSummary: "src/x.ts",
        rawInput: '{"path":"src/x.ts"}',
        error: { message: "permission denied" },
      },
    });
    // The identifier (`write`) is the primary name, not the human title.
    expect(call).toMatchObject({
      id: "t9",
      name: "write",
      summary: "Write file",
      phase: "failed",
      argsText: '{"path":"src/x.ts"}',
      errorText: "permission denied",
      isError: true,
    });
  });

  it("falls back to the artifact kind when no toolName is present", () => {
    const call = toolCallFromPart({
      type: "tool-call",
      artifact: { id: "k1", phase: "running", kind: "command", title: "ls" },
    });
    expect(call).toMatchObject({ name: "command", summary: "ls" });
  });

  it("promotes the summary when there is no identifier at all", () => {
    const call = toolCallFromPart({
      type: "tool-call",
      artifact: { id: "s1", phase: "completed", title: "Do the thing" },
    });
    expect(call).toMatchObject({ name: "Do the thing", summary: "" });
  });

  it("returns null for a degenerate tool-call part", () => {
    expect(toolCallFromPart({ type: "tool-call" })).toBeNull();
  });
});

describe("toolCallFromAction", () => {
  it("renders the action kind as the name with the title as summary", () => {
    const call = toolCallFromAction({
      id: "a2",
      kind: "command",
      title: "Run command",
      inputSummary: "npm test",
    });
    // Mid-stream the identifier is `kind`; the human title is secondary.
    expect(call).toMatchObject({
      id: "a2",
      name: "command",
      summary: "Run command",
      phase: "running",
      isError: false,
    });
  });

  it("promotes the title when the streamed action has no kind", () => {
    const call = toolCallFromAction({
      id: "a1",
      title: "Read file",
      inputSummary: "README.md",
    });
    expect(call).toMatchObject({
      id: "a1",
      name: "Read file",
      summary: "",
      phase: "running",
      isError: false,
    });
  });
});

describe("toolGroupLabel", () => {
  it("labels a single call as name · phase", () => {
    expect(toolGroupLabel([toolCall({ name: "bash", phase: "running" })])).toBe(
      "bash · Running",
    );
  });

  it("labels multiple calls with a plain count", () => {
    expect(
      toolGroupLabel([
        toolCall({ id: "a" }),
        toolCall({ id: "b" }),
        toolCall({ id: "c" }),
      ]),
    ).toBe("3 tool calls");
  });
});

describe("formatToolPhase", () => {
  it("maps known phases to human labels and passes through unknown ones", () => {
    expect(formatToolPhase("completed")).toBe("Done");
    expect(formatToolPhase("awaitingDecision")).toBe("Awaiting approval");
    expect(formatToolPhase("mystery")).toBe("mystery");
  });
});
