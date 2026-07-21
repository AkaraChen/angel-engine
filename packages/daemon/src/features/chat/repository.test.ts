import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import type { DaemonError } from "../../platform/errors";

import { Cause, Effect, Exit, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Db } from "../../platform/db";
import { normalizeChatRuntime } from "./repository";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Lookups are stubbed per test, so the database is never touched.
const testDbLayer = Layer.succeed(
  Db,
  new Db({ database: Effect.die("Database is not used in this test.") }),
);

async function runNormalizeChatRuntime(
  runtime: string | undefined,
  lookup?: (
    runtime: string,
  ) => Effect.Effect<CustomAgent | null, DaemonError, Db>,
) {
  const exit = await Effect.runPromiseExit(
    normalizeChatRuntime(runtime, lookup).pipe(Effect.provide(testDbLayer)),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

describe("normalizeChatRuntime", () => {
  it("rejects missing runtime ids", async () => {
    vi.stubEnv("ANGEL_ENGINE_RUNTIME", undefined);

    await expect(runNormalizeChatRuntime(undefined)).rejects.toThrow(
      "Chat runtime is required.",
    );
  });

  it("rejects unknown runtime ids", async () => {
    await expect(runNormalizeChatRuntime("bad-runtime")).rejects.toThrow(
      "Unknown chat runtime.",
    );
  });

  it("rejects unknown runtime ids from the environment", async () => {
    vi.stubEnv("ANGEL_ENGINE_RUNTIME", "bad-runtime");

    await expect(runNormalizeChatRuntime(undefined)).rejects.toThrow(
      "Unknown chat runtime.",
    );
  });

  it("rejects removed cursor runtime ids", async () => {
    await expect(runNormalizeChatRuntime("cursor")).rejects.toThrow(
      "Unknown chat runtime.",
    );
  });

  it("accepts builtin runtime ids", async () => {
    await expect(runNormalizeChatRuntime("kimi")).resolves.toBe("kimi");
  });

  it("accepts codex as an agent runtime id", async () => {
    await expect(runNormalizeChatRuntime("codex")).resolves.toBe("codex");
  });

  it("accepts existing custom runtime ids", async () => {
    await expect(
      runNormalizeChatRuntime("custom:agent", () =>
        Effect.succeed(customAgent("custom:agent")),
      ),
    ).resolves.toBe("custom:agent");
  });

  it("rejects missing custom runtime ids", async () => {
    await expect(
      runNormalizeChatRuntime("custom:missing", () => Effect.succeed(null)),
    ).rejects.toThrow("Unknown chat runtime.");
  });

  it("set-runtime validation happens before persistence", async () => {
    const runtime = "kimi";

    await expect(runNormalizeChatRuntime("bad-runtime")).rejects.toThrow(
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
