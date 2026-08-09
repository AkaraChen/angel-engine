import { afterEach, describe, expect, it } from "vitest";
import {
  appendComposerMarkdown,
  formatTerminalSelectionForComposer,
  hasTerminalSelection,
  publishTerminalSelectionInsert,
  subscribeToTerminalSelectionInserts,
} from "@/features/chat/components/composer/terminal-selection-to-composer";

async function flushPendingTerminalSelectionInserts() {
  const unsubscribe = subscribeToTerminalSelectionInserts(() => undefined);
  unsubscribe();
  await Promise.resolve();
}

describe("terminal selection composer formatting", () => {
  afterEach(async () => {
    await flushPendingTerminalSelectionInserts();
  });

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

  it("does not truncate a selection that is exactly the character limit", () => {
    const selection = "y".repeat(12_000);
    const formatted = formatTerminalSelectionForComposer({
      cwd: "/repo",
      selection,
    });

    expect(formatted).toContain(selection);
    expect(formatted).not.toContain("… [terminal selection truncated]");
  });

  it("avoids splitting a trailing surrogate pair when truncating", () => {
    const selection = `${"z".repeat(11_999)}\uD83D\uDE00`;
    const formatted = formatTerminalSelectionForComposer({
      cwd: "/repo",
      selection,
    });

    expect(formatted).toContain("z".repeat(11_999));
    expect(formatted).not.toContain("\uD83D");
    expect(formatted).toContain("… [terminal selection truncated]");
  });

  it("normalizes multiline cwd values into a single metadata line", () => {
    expect(
      formatTerminalSelectionForComposer({
        cwd: "/repo\nsecret",
        selection: "ok",
      }),
    ).toContain("Terminal selection (cwd: /repo secret)");
  });

  it("appends to an existing draft without changing its content", () => {
    expect(appendComposerMarkdown("Fix this", "```text\nerror\n```")).toBe(
      "Fix this\n\n```text\nerror\n```",
    );
  });

  it("uses the insertion alone when the composer draft is empty", () => {
    expect(appendComposerMarkdown("   ", "```text\nerror\n```")).toBe(
      "```text\nerror\n```",
    );
  });

  it("treats whitespace-only selections as empty", () => {
    expect(hasTerminalSelection("")).toBe(false);
    expect(hasTerminalSelection(" \n\t ")).toBe(false);
    expect(hasTerminalSelection("stack")).toBe(true);
  });

  it("ignores empty publishes and keeps a pending insert until a subscriber attaches", async () => {
    expect(
      publishTerminalSelectionInsert({
        cwd: "/repo",
        selection: "   ",
      }),
    ).toBe(false);

    expect(
      publishTerminalSelectionInsert({
        cwd: "/repo",
        selection: "pending stack",
      }),
    ).toBe(true);

    const received: string[] = [];
    const unsubscribe = subscribeToTerminalSelectionInserts((markdown) => {
      received.push(markdown);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toContain("pending stack");

    unsubscribe();
    await Promise.resolve();

    const receivedAgain: string[] = [];
    const unsubscribeAgain = subscribeToTerminalSelectionInserts((markdown) => {
      receivedAgain.push(markdown);
    });
    expect(receivedAgain).toEqual([]);
    unsubscribeAgain();
  });

  it("delivers immediately to an active subscriber", () => {
    const received: string[] = [];
    const unsubscribe = subscribeToTerminalSelectionInserts((markdown) => {
      received.push(markdown);
    });

    expect(
      publishTerminalSelectionInsert({
        cwd: "/repo",
        selection: "live stack",
      }),
    ).toBe(true);
    expect(received).toHaveLength(1);
    expect(received[0]).toContain("live stack");
    unsubscribe();
  });
});
