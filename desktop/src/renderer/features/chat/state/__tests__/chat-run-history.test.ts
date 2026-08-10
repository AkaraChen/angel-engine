import type { AppendMessage } from "@assistant-ui/react";
import { describe, expect, it } from "vitest";

import {
  appendMessageToEngineMessage,
  canonicalCreatedAtOf,
  engineMessagesToHistoryMessages,
  historyMessageToEngineMessage,
} from "../chat-run-history";

function historyMessage(createdAt?: string) {
  return {
    content: [{ text: "hello", type: "text" as const }],
    ...(createdAt === undefined ? {} : { createdAt }),
    id: "m1",
    role: "user" as const,
  };
}

describe("historyMessageToEngineMessage timestamps", () => {
  it("carries a valid canonical timestamp through metadata", () => {
    const engine = historyMessageToEngineMessage(
      historyMessage("2026-07-25T10:15:00.000Z"),
    );
    expect(canonicalCreatedAtOf(engine)).toBe("2026-07-25T10:15:00.000Z");
  });

  it("marks a missing timestamp as absent instead of inventing one", () => {
    const engine = historyMessageToEngineMessage(historyMessage());
    expect(canonicalCreatedAtOf(engine)).toBeNull();
    // assistant-ui requires a Date, but it must never round-trip back out.
    const [history] = engineMessagesToHistoryMessages([engine]);
    expect(history.createdAt).toBeUndefined();
  });

  it("marks an invalid timestamp as absent instead of inventing one", () => {
    const engine = historyMessageToEngineMessage(historyMessage("not-a-date"));
    expect(canonicalCreatedAtOf(engine)).toBeNull();
    const [history] = engineMessagesToHistoryMessages([engine]);
    expect(history.createdAt).toBeUndefined();
  });

  it("round-trips the exact canonical timestamp", () => {
    const engine = historyMessageToEngineMessage(
      historyMessage("2026-07-25T10:15:00.000Z"),
    );
    const [history] = engineMessagesToHistoryMessages([engine]);
    expect(history.createdAt).toBe("2026-07-25T10:15:00.000Z");
  });
});

describe("appendMessageToEngineMessage timestamps", () => {
  it("stamps the genuine client send moment as canonical", () => {
    const engine = appendMessageToEngineMessage(
      {
        content: [{ text: "hi", type: "text" }],
        role: "user",
      } as unknown as AppendMessage,
      "user-1",
    );
    const marker = canonicalCreatedAtOf(engine);
    expect(typeof marker).toBe("string");
    expect(Number.isNaN(new Date(marker as string).getTime())).toBe(false);
  });
});

describe("canonicalCreatedAtOf", () => {
  it("returns undefined for messages converted outside the marked paths", () => {
    expect(
      canonicalCreatedAtOf({
        createdAt: new Date(),
        id: "x",
        metadata: { custom: {} },
        role: "user",
      } as Parameters<typeof canonicalCreatedAtOf>[0]),
    ).toBeUndefined();
  });
});
