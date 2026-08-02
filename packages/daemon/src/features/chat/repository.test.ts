import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import type { AppDatabase } from "../../platform/db";
import type { DaemonError } from "../../platform/errors";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Cause, Effect, Exit, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chats, customAgents, projects } from "../../db/schema";
import { Db } from "../../platform/db";
import { beginChatSend, normalizeChatRuntime } from "./repository";

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

describe("beginChatSend", () => {
  it("titles a still-unnamed chat from the prompt", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });

    const chat = await runWithDatabase(
      database,
      beginChatSend("chat-1", "  Fix   the   sidebar  "),
    );

    expect(chat.title).toBe("Fix the sidebar");
  });

  it("truncates a long prompt title", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });

    const chat = await runWithDatabase(
      database,
      beginChatSend("chat-1", "x".repeat(80)),
    );

    expect(chat.title).toBe(`${"x".repeat(47)}...`);
  });

  it("keeps a title the chat already earned", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "Named by hand" });

    const chat = await runWithDatabase(
      database,
      beginChatSend("chat-1", "a later prompt"),
    );

    expect(chat.title).toBe("Named by hand");
  });

  it("keeps the default title when the send carries attachments only", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });

    const chat = await runWithDatabase(database, beginChatSend("chat-1", ""));

    expect(chat.title).toBe("New chat");
  });

  it("bumps updatedAt so the chat list reorders before the turn runs", async () => {
    const database = await memoryDatabase();
    await seedChat(database, {
      title: "Named by hand",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });

    const chat = await runWithDatabase(
      database,
      beginChatSend("chat-1", "a later prompt"),
    );

    expect(chat.updatedAt > "2020-01-01T00:00:00.000Z").toBe(true);
  });
});

async function memoryDatabase(): Promise<AppDatabase> {
  const client = createClient({ url: ":memory:" });
  await client.execute(`
    CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT,
      cwd TEXT,
      runtime TEXT NOT NULL,
      remote_thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0
    )
  `);
  return drizzle(client, {
    schema: { chats, customAgents, projects },
  }) as AppDatabase;
}

async function seedChat(
  database: AppDatabase,
  overrides: { title: string; updatedAt?: string },
): Promise<void> {
  const timestamp = overrides.updatedAt ?? "2026-01-01T00:00:00.000Z";
  await database.insert(chats).values({
    archived: false,
    createdAt: timestamp,
    cwd: null,
    id: "chat-1",
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: overrides.title,
    updatedAt: timestamp,
  });
}

async function runWithDatabase<A>(
  database: AppDatabase,
  effect: Effect.Effect<A, DaemonError, Db>,
): Promise<A> {
  const exit = await Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(
        Layer.succeed(Db, new Db({ database: Effect.succeed(database) })),
      ),
    ),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

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
