import { describe, expect, it } from "vitest";
import { resolveChatRunAccepted } from "./chat-run-submission";

const DRAFT_SLOT = "draft:project:project-1";

describe("chat run submission acceptance", () => {
  it("accepts an existing chat even when its run reports an error", () => {
    expect(
      resolveChatRunAccepted({
        cancelled: false,
        error: "runtime failed",
        hadChatId: true,
        hasResult: false,
        initialSlotKey: "chat-1",
        slotKey: "chat-1",
      }),
    ).toBe(true);
  });

  it.each([
    { hasResult: false, slotKey: "chat-1" },
    { hasResult: true, slotKey: DRAFT_SLOT },
  ])("accepts a new chat once it is durable", ({ hasResult, slotKey }) => {
    expect(
      resolveChatRunAccepted({
        cancelled: false,
        hadChatId: false,
        hasResult,
        initialSlotKey: DRAFT_SLOT,
        slotKey,
      }),
    ).toBe(true);
  });

  it("rejects a cancelled draft run before a chat is created", () => {
    expect(
      resolveChatRunAccepted({
        cancelled: true,
        hadChatId: false,
        hasResult: false,
        initialSlotKey: DRAFT_SLOT,
        slotKey: DRAFT_SLOT,
      }),
    ).toBe(false);
  });

  it("throws the runtime error when a draft run ends before creation", () => {
    expect(() =>
      resolveChatRunAccepted({
        cancelled: false,
        error: "runtime failed",
        hadChatId: false,
        hasResult: false,
        initialSlotKey: DRAFT_SLOT,
        slotKey: DRAFT_SLOT,
      }),
    ).toThrow("runtime failed");
  });
});
