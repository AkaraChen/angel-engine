import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  applyChatRunAttentionEvent,
  setChatRunAttention,
  useChatRunAttention,
} from "./run-attention";

describe("chat run attention", () => {
  it("tracks needs-input and completion from the same run event stream", () => {
    const { result } = renderHook(() => useChatRunAttention("chat-attention"));
    expect(result.current).toBeNull();

    act(() =>
      applyChatRunAttentionEvent("chat-attention", "run-1", {
        elicitation: {
          id: "elic-1",
          kind: "approval",
          phase: "open",
        },
        type: "elicitation",
      }),
    );
    expect(result.current).toBe("needsInput");

    act(() =>
      applyChatRunAttentionEvent("chat-attention", "run-1", {
        type: "done",
      }),
    );
    expect(result.current).toBe("completed");

    act(() => setChatRunAttention("chat-attention", "run-1", null));
    expect(result.current).toBeNull();
  });
});
