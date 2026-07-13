import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizeChatRuntime } from "./repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("normalizeChatRuntime", () => {
  it("rejects missing runtime ids", () => {
    vi.stubEnv("ANGEL_ENGINE_RUNTIME", undefined);

    expect(() => normalizeChatRuntime(undefined)).toThrow(
      "Chat runtime is required.",
    );
  });

  it("rejects unknown runtime ids", () => {
    expect(() => normalizeChatRuntime("bad-runtime")).toThrow(
      "Unknown chat runtime.",
    );
  });

  it("rejects unknown runtime ids from the environment", () => {
    vi.stubEnv("ANGEL_ENGINE_RUNTIME", "bad-runtime");

    expect(() => normalizeChatRuntime(undefined)).toThrow(
      "Unknown chat runtime.",
    );
  });

  it("rejects removed cursor runtime ids", () => {
    expect(() => normalizeChatRuntime("cursor")).toThrow(
      "Unknown chat runtime.",
    );
  });

  it("accepts builtin runtime ids", () => {
    expect(normalizeChatRuntime("kimi")).toBe("kimi");
  });

  it("accepts codex as an agent runtime id", () => {
    expect(normalizeChatRuntime("codex")).toBe("codex");
  });

  it("accepts existing custom runtime ids", () => {
    expect(
      normalizeChatRuntime(
        "custom:agent",
        vi.fn(() => customAgent("custom:agent")),
      ),
    ).toBe("custom:agent");
  });

  it("rejects missing custom runtime ids", () => {
    expect(() =>
      normalizeChatRuntime(
        "custom:missing",
        vi.fn(() => null),
      ),
    ).toThrow("Unknown chat runtime.");
  });

  it("set-runtime validation happens before persistence", () => {
    const runtime = "kimi";

    expect(() => normalizeChatRuntime("bad-runtime")).toThrow(
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
