import type {
  ConversationToolCall,
  DaemonHistoryMessage,
  DaemonMessagePart,
  DaemonToolAction,
  DaemonToolCallPart,
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

function toolAction(
  overrides: Partial<DaemonToolAction> = {},
): DaemonToolAction {
  return {
    id: "t",
    turnId: "turn-1",
    kind: "command",
    phase: "completed",
    title: "Run command",
    rawInput: "{}",
    output: [],
    outputText: "",
    ...overrides,
  };
}

function toolPart(
  overrides: Partial<DaemonToolCallPart> = {},
): DaemonToolCallPart {
  const artifact = overrides.artifact ?? toolAction();
  return {
    args: {},
    argsText: artifact.rawInput ?? "{}",
    artifact,
    toolCallId: artifact.id,
    toolName: artifact.kind,
    type: "tool-call",
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
    const parts: DaemonMessagePart[] = [
      { type: "reasoning", text: "thinking " },
      { type: "text", text: "hello " },
      { type: "text", text: "world" },
      toolPart(),
    ];
    expect(partsToText(parts, "text")).toBe("hello world");
    expect(partsToText(parts, "reasoning")).toBe("thinking ");
  });

  it("ignores parts without string text", () => {
    const parts: DaemonMessagePart[] = [
      { type: "image", image: "data:image/png;base64,AA==" },
      { type: "text", text: "kept" },
    ];
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
    expect(result[0].plans).toEqual([]);
    expect(result[1].plans).toEqual([]);
  });

  it("projects plan data parts and keeps plan-only assistant turns", () => {
    const result = toConversation([
      message({
        id: "a1",
        role: "assistant",
        content: [
          {
            type: "data",
            name: "plan",
            data: {
              text: "Ship plan mode",
              entries: [{ content: "Toggle", status: "pending" }],
              kind: "review",
            },
          },
        ],
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].plans).toHaveLength(1);
    expect(result[0].plans[0].text).toBe("Ship plan mode");
    expect(result[0].text).toBe("");
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
      message({ id: "a1", role: "assistant", content: [] }),
    ]);
    expect(result.map((m) => m.id)).toEqual(["u1"]);
  });

  it("keeps a pure tool-call assistant turn and projects its tool calls", () => {
    const result = toConversation([
      message({
        id: "a1",
        role: "assistant",
        content: [
          toolPart({
            argsText: "ls -la",
            artifact: toolAction({
              id: "t1",
              outputText: "file.ts",
              rawInput: '{"command":"ls -la"}',
              title: undefined,
            }),
            toolCallId: "t1",
            toolName: "bash",
          }),
        ],
      }),
    ]);
    expect(result.map((m) => m.id)).toEqual(["a1"]);
    expect(result[0].toolCalls).toMatchObject([
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
    const call = toolCallFromPart(
      toolPart({
        argsText: '{"path":"src/x.ts"}',
        toolCallId: "t9",
        toolName: "write",
        isError: true,
        artifact: toolAction({
          id: "t9",
          phase: "failed",
          kind: "fileChange",
          title: "Write file",
          inputSummary: "src/x.ts",
          rawInput: '{"path":"src/x.ts"}',
          error: {
            code: "permission_denied",
            message: "permission denied",
            recoverable: false,
          },
        }),
      }),
    );
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

  it("falls back to the artifact kind when toolName is empty", () => {
    const call = toolCallFromPart(
      toolPart({
        artifact: toolAction({
          id: "k1",
          phase: "running",
          kind: "command",
          title: "ls",
        }),
        toolName: "",
      }),
    );
    expect(call).toMatchObject({ name: "command", summary: "ls" });
  });
});

describe("toolCallFromAction", () => {
  it("renders the action kind as the name with the title as summary", () => {
    const call = toolCallFromAction(
      toolAction({
        id: "a2",
        kind: "command",
        phase: "running",
        title: "Run command",
        inputSummary: "npm test",
        rawInput: '{"command":"npm test"}',
      }),
    );
    // Mid-stream the identifier is `kind`; the human title is secondary.
    expect(call).toMatchObject({
      id: "a2",
      name: "command",
      summary: "Run command",
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
  it("maps the upstream closed phase union to human labels", () => {
    expect(formatToolPhase("completed")).toBe("Done");
    expect(formatToolPhase("awaitingDecision")).toBe("Awaiting approval");
  });
});
