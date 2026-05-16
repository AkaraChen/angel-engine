import { describe, expect, it } from "vitest";
import type { ChatToolAction, ChatToolCallPart } from "../../types";
import {
  chatToolActionToPart,
  isChatToolAction,
  isTerminalChatToolPhase,
} from "../tools";

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

describe("tool utils", () => {
  it("converts tool actions into assistant-ui parts", () => {
    const part: ChatToolCallPart = chatToolActionToPart(toolAction());

    expect(part).toMatchObject({
      args: { cmd: "pwd" },
      result: "done",
      toolCallId: "action-1",
      toolName: "command",
      type: "tool-call",
    });
  });

  it("checks actions and classifies terminal phases", () => {
    const action: ChatToolAction = toolAction({
      error: { code: "E", message: "failed", recoverable: false },
    });

    expect(isChatToolAction(action)).toBe(true);
    expect(isTerminalChatToolPhase("running")).toBe(false);
    expect(isTerminalChatToolPhase("failed")).toBe(true);
  });
});
