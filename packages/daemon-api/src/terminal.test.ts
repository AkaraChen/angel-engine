import { describe, expect, it } from "vitest";
import { parseTerminalClientMessage } from "./terminal";

describe("parseTerminalClientMessage", () => {
  it("parses each terminal frame with its precise payload", () => {
    expect(
      parseTerminalClientMessage({
        cols: 80,
        cwd: "/tmp",
        rows: 24,
        sessionId: "terminal-1",
        type: "create",
      }),
    ).toEqual({
      cols: 80,
      cwd: "/tmp",
      rows: 24,
      sessionId: "terminal-1",
      type: "create",
    });
    expect(
      parseTerminalClientMessage({
        data: "pwd\n",
        sessionId: "terminal-1",
        type: "write",
      }),
    ).toEqual({ data: "pwd\n", sessionId: "terminal-1", type: "write" });
  });

  it("rejects unknown and malformed frames", () => {
    expect(() =>
      parseTerminalClientMessage({ sessionId: "terminal-1", type: "attach" }),
    ).toThrow("Unknown terminal message type");
    expect(() =>
      parseTerminalClientMessage({
        cols: 0,
        rows: 24,
        sessionId: "terminal-1",
        type: "resize",
      }),
    ).toThrow("positive numbers");
  });
});
