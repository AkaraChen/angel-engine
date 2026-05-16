import type {
  AdapterDecodeInput,
  AdapterEncodeInput,
  TransportOutput,
} from "@angel-engine/client-napi";
import { ClientProtocol } from "@angel-engine/client-napi";
import { describe, expect, it } from "vitest";
import { ClaudeCodeEngineAdapter } from "../adapter";

function encodeInput(effect: Record<string, unknown>): AdapterEncodeInput {
  return { effect };
}

describe("ClaudeCodeEngineAdapter", () => {
  it("advertises the custom protocol flavor", () => {
    const adapter: ClaudeCodeEngineAdapter = new ClaudeCodeEngineAdapter();

    expect(adapter.protocolFlavor()).toBe(ClientProtocol.Custom);
  });

  it("normalizes session creation into a conversation-ready event", () => {
    const adapter: ClaudeCodeEngineAdapter = new ClaudeCodeEngineAdapter();
    const output: TransportOutput = adapter.encodeEffect(
      encodeInput({
        conversationId: "conversation-1",
        method: "session/new",
        payload: {
          fields: {
            additionalDirectoryCount: 1,
            "additionalDirectory.0": "/repo",
            cwd: "/work",
            remoteConversationId: "remote-1",
          },
        },
        requestId: "request-1",
      }),
    );

    expect(output.completedRequests).toEqual(["request-1"]);
    expect(output.events).toEqual([
      {
        ConversationReady: {
          capabilities: null,
          context: {
            updates: [
              { Cwd: { cwd: "/work", scope: "Conversation" } },
              {
                AdditionalDirectories: {
                  directories: ["/repo"],
                  scope: "Conversation",
                },
              },
            ],
          },
          id: "conversation-1",
          remote: { Known: "remote-1" },
        },
      },
    ]);
  });

  it("passes through claude/event messages only", () => {
    const adapter: ClaudeCodeEngineAdapter = new ClaudeCodeEngineAdapter();
    const input: AdapterDecodeInput = {
      message: {
        method: "claude/event",
        params: { events: [{ TurnStarted: { id: "turn-1" } }] },
      },
    };

    expect(adapter.decodeMessage(input)).toEqual({
      events: [{ TurnStarted: { id: "turn-1" } }],
    });
    expect(adapter.decodeMessage({ message: { method: "other" } })).toEqual({});
  });
});
