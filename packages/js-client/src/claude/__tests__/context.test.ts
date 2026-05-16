import { EngineEventType } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import type { ClaudeEngineEventJson, ClaudeJsonObject } from "../types";
import { contextPatch, contextUpdated } from "../context";

describe("claude context helpers", () => {
  it("wraps context updates as engine events", () => {
    const event: ClaudeEngineEventJson = contextUpdated("conversation-1", [
      { Model: { model: "claude-sonnet", scope: "TurnAndFuture" } },
    ]);

    expect(event).toEqual({
      [EngineEventType.ContextUpdated]: {
        conversation_id: "conversation-1",
        patch: {
          updates: [
            { Model: { model: "claude-sonnet", scope: "TurnAndFuture" } },
          ],
        },
      },
    });
  });

  it("filters invalid context patches before they reach engine state", () => {
    const patch: ClaudeJsonObject = contextPatch([
      { Cwd: { cwd: undefined, scope: "Conversation" } },
      { AdditionalDirectories: { directories: "bad", scope: "Conversation" } },
      { Model: { model: "ok", scope: "TurnAndFuture" } },
    ]);

    expect(patch).toEqual({
      updates: [{ Model: { model: "ok", scope: "TurnAndFuture" } }],
    });
  });
});
