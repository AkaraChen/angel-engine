import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeChatRuntime } from "./repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeChatRuntime", () => {
  it("rejects missing runtime ids", async () => {
    vi.stubEnv("ANGEL_ENGINE_RUNTIME", undefined);

    await expect(normalizeChatRuntime(undefined)).rejects.toThrow(
      "Chat runtime is required.",
    );
  });

  it("rejects unknown runtime ids", async () => {
    await expect(normalizeChatRuntime("bad-runtime")).rejects.toThrow(
      "Unknown chat runtime.",
    );
  });

  it("rejects unknown runtime ids from the environment", async () => {
    vi.stubEnv("ANGEL_ENGINE_RUNTIME", "bad-runtime");

    await expect(normalizeChatRuntime(undefined)).rejects.toThrow(
      "Unknown chat runtime.",
    );
  });

  it("rejects removed cursor runtime ids", async () => {
    await expect(normalizeChatRuntime("cursor")).rejects.toThrow(
      "Unknown chat runtime.",
    );
  });

  it("accepts builtin runtime ids", async () => {
    await expect(normalizeChatRuntime("kimi")).resolves.toBe("kimi");
  });

  it("accepts codex as an agent runtime id", async () => {
    await expect(normalizeChatRuntime("codex")).resolves.toBe("codex");
  });

  it("accepts existing custom runtime ids", async () => {
    await expect(
      normalizeChatRuntime(
        "custom:agent",
        vi.fn(() => customAgent("custom:agent")),
      ),
    ).resolves.toBe("custom:agent");
  });

  it("rejects missing custom runtime ids", async () => {
    await expect(
      normalizeChatRuntime(
        "custom:missing",
        vi.fn(() => null),
      ),
    ).rejects.toThrow("Unknown chat runtime.");
  });

  it("set-runtime validation happens before persistence", async () => {
    const runtime = "kimi";

    await expect(normalizeChatRuntime("bad-runtime")).rejects.toThrow(
      "Unknown chat runtime.",
    );
    expect(runtime).toBe("kimi");
  });
});

function customAgent(id: CustomAgent["id"]): CustomAgent {
  return {
    args: [],
    autoAuthenticate: false,
    command: "agent",
    createdAt: "2026-01-01T00:00:00.000Z",
    environment: [],
    id,
    label: "Agent",
    needAuth: false,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
