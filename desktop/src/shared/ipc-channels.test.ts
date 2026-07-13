import { describe, expect, it } from "vitest";

import { TIPC_CHANNEL_SET } from "./ipc-channels";

describe("tipc channel set", () => {
  it("allows app router channels and blocks raw IPC channels", () => {
    expect(TIPC_CHANNEL_SET.has("chatsShowContextMenu")).toBe(true);
    expect(TIPC_CHANNEL_SET.has("chatSend")).toBe(false);
    expect(TIPC_CHANNEL_SET.has("terminal:create")).toBe(false);
    expect(TIPC_CHANNEL_SET.has("__proto__")).toBe(false);
  });
});
