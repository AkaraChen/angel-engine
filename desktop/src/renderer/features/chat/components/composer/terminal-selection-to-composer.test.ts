import { describe, expect, it } from "vitest";
import {
  appendComposerMarkdown,
  formatTerminalSelectionForComposer,
} from "@/features/chat/components/composer/terminal-selection-to-composer";

describe("terminal selection composer formatting", () => {
  it("adds cwd metadata and preserves the selected terminal output", () => {
    expect(
      formatTerminalSelectionForComposer({
        cwd: "/repo/angel-engine",
        selection: "error: test failed\n  at suite.ts:42",
      }),
    ).toBe(
      "Terminal selection (cwd: /repo/angel-engine)\n\n```text\nerror: test failed\n  at suite.ts:42\n```",
    );
  });

  it("uses a safe fence when the terminal output contains backticks", () => {
    expect(
      formatTerminalSelectionForComposer({
        cwd: "/repo",
        selection: "printed ``` inside output",
      }),
    ).toContain("````text\nprinted ``` inside output\n````");
  });

  it("truncates oversized selections with an explicit marker", () => {
    const formatted = formatTerminalSelectionForComposer({
      cwd: "/repo",
      selection: "x".repeat(12_001),
    });

    expect(formatted).toContain("x".repeat(12_000));
    expect(formatted).toContain("… [terminal selection truncated]");
    expect(formatted).not.toContain("x".repeat(12_001));
  });

  it("appends to an existing draft without changing its content", () => {
    expect(appendComposerMarkdown("Fix this", "```text\nerror\n```")).toBe(
      "Fix this\n\n```text\nerror\n```",
    );
  });
});
