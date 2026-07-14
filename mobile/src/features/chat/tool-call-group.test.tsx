import type { ConversationToolCall } from "@/platform/chat-types";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ToolCallGroup } from "./tool-call-group";

afterEach(cleanup);

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

describe("ToolCallGroup", () => {
  it("shows a single summary line for all tool calls", () => {
    render(
      <ToolCallGroup
        calls={[toolCall({ id: "a" }), toolCall({ id: "b" })]}
        collapsed
      />,
    );
    expect(screen.getByText("2 tool calls")).toBeDefined();
  });

  it("auto-collapses once the turn has streamed text", () => {
    render(<ToolCallGroup calls={[toolCall()]} collapsed />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("stays expanded while the turn has no prose yet", () => {
    render(
      <ToolCallGroup
        calls={[toolCall({ phase: "running" })]}
        collapsed={false}
      />,
    );
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("lets a manual tap override the auto-collapse", () => {
    render(<ToolCallGroup calls={[toolCall()]} collapsed />);
    const trigger = screen.getByRole("button");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });
});
