import type { ChatHistoryMessage } from "@angel-engine/daemon-api/chat";
import { describe, expect, it } from "vitest";
import {
  buildSessionHandoffContextPack,
  extractKeyFiles,
  summarizeConversation,
} from "./session-handoff-context";

const sourceChat = {
  cwd: "/repo/angel",
  id: "chat-source",
  runtime: "codex",
  title: "Fix auth",
};

function user(text: string, id = "u1"): ChatHistoryMessage {
  return {
    content: [{ text, type: "text" }],
    id,
    role: "user",
  };
}

function assistant(
  text: string,
  extras: ChatHistoryMessage["content"] = [],
  id = "a1",
): ChatHistoryMessage {
  return {
    content: [{ text, type: "text" }, ...extras],
    id,
    role: "assistant",
  };
}

describe("session handoff context pack", () => {
  it("summarizes recent user/assistant turns and truncates long bodies", () => {
    const long = "x".repeat(2_000);
    const turns = summarizeConversation(
      [user("hello"), assistant(long), user("keep going", "u2")],
      2,
      50,
    );
    expect(turns).toHaveLength(2);
    expect(turns[0]?.role).toBe("assistant");
    expect(turns[0]?.text.endsWith("…")).toBe(true);
    expect(turns[1]?.text).toBe("keep going");
  });

  it("extracts key files from tool args and file parts", () => {
    const messages: ChatHistoryMessage[] = [
      assistant("editing", [
        {
          args: { file_path: "src/auth.ts", mode: "write" },
          argsText: '{"file_path":"src/auth.ts"}',
          artifact: {
            id: "t1",
            name: "edit",
            phase: "completed",
          } as never,
          toolCallId: "t1",
          toolName: "edit",
          type: "tool-call",
        },
        {
          data: "unused",
          filename: "notes.md",
          mimeType: "text/markdown",
          path: "/repo/notes.md",
          type: "file",
        },
      ]),
    ];
    expect(extractKeyFiles(messages)).toEqual([
      "src/auth.ts",
      "/repo/notes.md",
      "notes.md",
    ]);
  });

  it("builds a same-agent pack with dirty warning, notes, and workspace cwd", () => {
    const pack = buildSessionHandoffContextPack({
      dirtyStatus: { branch: "feat/auth", isDirty: true },
      messages: [
        user("Please fix login"),
        assistant("I will update auth.ts", [
          {
            args: { path: "src/auth.ts" },
            argsText: '{"path":"src/auth.ts"}',
            artifact: {
              id: "t1",
              name: "read",
              phase: "completed",
            } as never,
            toolCallId: "t1",
            toolName: "read",
            type: "tool-call",
          },
        ]),
      ],
      notes: "Quota exhausted — continue with the same agent.",
      sourceChat,
      targetRuntime: "codex",
    });

    expect(pack.dirtyWarning).toContain("dirty");
    expect(pack.dirtyWarning).toContain("feat/auth");
    expect(pack.keyFiles).toContain("src/auth.ts");
    expect(pack.prompt).toContain("same agent");
    expect(pack.prompt).toContain("/repo/angel");
    expect(pack.prompt).toContain("chat-source");
    expect(pack.prompt).toContain("Quota exhausted");
    expect(pack.prompt).toContain("Please fix login");
    expect(pack.prompt).toContain("src/auth.ts");
    expect(pack.prompt).toContain("previous session remains available");
  });

  it("marks cross-harness handoffs without same-agent label", () => {
    const pack = buildSessionHandoffContextPack({
      messages: [user("switch")],
      sourceChat,
      targetRuntime: "claude",
    });
    expect(pack.prompt).toContain("To agent: `claude`");
    expect(pack.prompt).not.toContain("(same agent)");
    expect(pack.dirtyWarning).toBeNull();
  });
});
