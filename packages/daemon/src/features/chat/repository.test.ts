import type { CustomAgent } from "@angel-engine/daemon-api/agents";
import type { AppDatabase } from "../../platform/db";
import type { DaemonError } from "../../platform/errors";

import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { Cause, Effect, Exit, Layer } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  chatDiffAnchors,
  chats,
  customAgents,
  projects,
  queuedChatRuns,
  pullRequests,
  worktreeCreationJobs,
} from "../../db/schema";
import { Db } from "../../platform/db";
import {
  beginQueuedChatRunDispatch,
  beginChatSend,
  cancelAmbiguousQueuedChatRun,
  cancelQueuedChatRun,
  completeQueuedChatRun,
  createQueuedChatRun,
  createWorktreeCreationJob,
  deleteWorktreeCreationJob,
  failInterruptedWorktreeCreationJobs,
  getWorktreeCreationJob,
  getAmbiguousQueuedChatRun,
  listRecoverableQueuedChatRuns,
  listQueuedChatRuns,
  listWorktreeCreationJobs,
  normalizeChatRuntime,
  renameChat,
  updateWorktreeCreationJob,
} from "./repository";

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

  it("never writes over a title the chat already earned", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "Named by hand" });

    const chat = await runWithDatabase(
      database,
      beginChatSend("chat-1", "a later prompt"),
    );

    expect(chat.title).toBe("Named by hand");
    await expect(storedTitle(database)).resolves.toBe("Named by hand");
  });

  it("keeps the default title when the send carries attachments only", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });

    const chat = await runWithDatabase(database, beginChatSend("chat-1", ""));

    expect(chat.title).toBe("New chat");
  });

  it("lets a manual rename racing the send win", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });

    // A read-then-write of the title loses this: whichever order the two land
    // in, the send would stamp the default title it read back over the name the
    // user chose. The manual rename has to win from both sides.
    await Promise.all([
      runWithDatabase(database, beginChatSend("chat-1", "the first prompt")),
      runWithDatabase(database, renameChat("chat-1", "Named by hand")),
    ]);

    await expect(storedTitle(database)).resolves.toBe("Named by hand");
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

describe("worktree creation jobs", () => {
  it("restores branch-owner recovery metadata after a daemon restart", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });
    await runWithDatabase(
      database,
      createWorktreeCreationJob({
        chatId: "chat-1",
        state: {
          jobId: "job-1",
          progress: 0,
          stage: "fetching",
          status: "creating",
        },
      }),
    );
    await runWithDatabase(
      database,
      updateWorktreeCreationJob({
        chatId: "chat-1",
        state: {
          error: "The branch is already checked out.",
          errorCode: "worktree-branch-in-use",
          jobId: "job-1",
          progress: 40,
          relatedChatId: "chat-owning-branch",
          stage: "worktree",
          status: "failed",
        },
      }),
    );

    // ChatEngine rebuilds its decorated chat state from this repository list
    // after every daemon start, rather than retaining an in-memory job object.
    await expect(
      runWithDatabase(database, listWorktreeCreationJobs()),
    ).resolves.toEqual([
      expect.objectContaining({
        chatId: "chat-1",
        state: expect.objectContaining({
          errorCode: "worktree-branch-in-use",
          relatedChatId: "chat-owning-branch",
          status: "failed",
        }),
      }),
    ]);
  });

  it("turns an interrupted creating job into a retryable failure", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });
    await runWithDatabase(
      database,
      createWorktreeCreationJob({
        chatId: "chat-1",
        setupApproval: "old-digest",
        state: {
          jobId: "job-1",
          progress: 45,
          stage: "worktree",
          status: "creating",
        },
      }),
    );

    await runWithDatabase(database, failInterruptedWorktreeCreationJobs());

    await expect(
      runWithDatabase(database, getWorktreeCreationJob("chat-1")),
    ).resolves.toMatchObject({
      setupApproval: "old-digest",
      state: {
        error: expect.stringContaining("interrupted"),
        progress: 45,
        status: "failed",
      },
    });
    await runWithDatabase(database, deleteWorktreeCreationJob("chat-1"));
    await expect(
      runWithDatabase(database, getWorktreeCreationJob("chat-1")),
    ).resolves.toBeNull();
  });
});

describe("queued chat runs", () => {
  it("exposes and clears a restart-ambiguous send by chat before a replacement", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });
    await runWithDatabase(
      database,
      createQueuedChatRun({
        createdAt: "2026-08-10T00:00:00.000Z",
        input: { chatId: "chat-1", text: "possibly sent" },
        runId: "run-ambiguous",
        state: "dispatching",
      }),
    );

    await expect(
      runWithDatabase(database, getAmbiguousQueuedChatRun("chat-1")),
    ).resolves.toMatchObject({
      input: { chatId: "chat-1", text: "possibly sent" },
      runId: "run-ambiguous",
      state: "dispatching",
    });
    await expect(
      runWithDatabase(database, cancelAmbiguousQueuedChatRun("chat-1")),
    ).resolves.toEqual({ runId: "run-ambiguous" });
    await expect(
      runWithDatabase(database, listQueuedChatRuns()),
    ).resolves.toEqual([]);

    await expect(
      runWithDatabase(
        database,
        createQueuedChatRun({
          createdAt: "2026-08-10T00:00:01.000Z",
          input: { chatId: "chat-1", text: "send again" },
          runId: "run-replacement",
          state: "queued",
        }),
      ),
    ).resolves.toBeDefined();
  });

  it("keeps a claimed input durable across the provider-start crash window", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });
    const input = { chatId: "chat-1", text: "send after setup" };

    await runWithDatabase(
      database,
      createQueuedChatRun({
        createdAt: "2026-08-10T00:00:00.000Z",
        input,
        runId: "run-1",
        state: "queued",
      }),
    );

    await expect(
      runWithDatabase(database, beginQueuedChatRunDispatch("run-1")),
    ).resolves.toBe("claimed");

    await expect(
      runWithDatabase(database, listQueuedChatRuns()),
    ).resolves.toEqual([
      {
        createdAt: "2026-08-10T00:00:00.000Z",
        input,
        runId: "run-1",
        state: "dispatching",
      },
    ]);

    // A daemon restart may not know whether the provider started. The durable
    // dispatching row is retained, but only queued rows are auto-dispatched.
    await expect(
      runWithDatabase(database, beginQueuedChatRunDispatch("run-1")),
    ).resolves.toBe("dispatching");
    await expect(
      runWithDatabase(database, listRecoverableQueuedChatRuns()),
    ).resolves.toEqual([]);
    await expect(
      runWithDatabase(database, listQueuedChatRuns()),
    ).resolves.toHaveLength(1);

    await runWithDatabase(database, cancelQueuedChatRun("run-1"));
    await expect(
      runWithDatabase(database, listQueuedChatRuns()),
    ).resolves.toEqual([]);
  });

  it("removes a dispatching row only after provider completion", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { title: "New chat" });
    await runWithDatabase(
      database,
      createQueuedChatRun({
        createdAt: "2026-08-10T00:00:00.000Z",
        input: { chatId: "chat-1", text: "send after setup" },
        runId: "run-1",
        state: "queued",
      }),
    );
    await runWithDatabase(database, beginQueuedChatRunDispatch("run-1"));

    await runWithDatabase(database, completeQueuedChatRun("run-1"));

    await expect(
      runWithDatabase(database, listQueuedChatRuns()),
    ).resolves.toEqual([]);
  });

  it("deletes a corrupt row without blocking recovery of valid inputs", async () => {
    const database = await memoryDatabase();
    await seedChat(database, { id: "chat-corrupt", title: "Corrupt" });
    await seedChat(database, { id: "chat-valid", title: "Valid" });
    await database.insert(queuedChatRuns).values([
      {
        chatId: "chat-corrupt",
        createdAt: "2026-08-10T00:00:00.000Z",
        input: "{not-json",
        runId: "run-corrupt",
        state: "queued",
      },
      {
        chatId: "chat-valid",
        createdAt: "2026-08-10T00:00:01.000Z",
        input: JSON.stringify({ chatId: "chat-valid", text: "recover me" }),
        runId: "run-valid",
        state: "queued",
      },
    ]);

    await expect(
      runWithDatabase(database, listRecoverableQueuedChatRuns()),
    ).resolves.toEqual([
      {
        createdAt: "2026-08-10T00:00:01.000Z",
        input: { chatId: "chat-valid", text: "recover me" },
        runId: "run-valid",
        state: "queued",
      },
    ]);
    await expect(
      database.select().from(queuedChatRuns).all(),
    ).resolves.toHaveLength(1);
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
      source_link TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0
    )
  `);
  await client.execute(`
    CREATE TABLE chat_diff_anchors (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      sha TEXT NOT NULL,
      turn_id TEXT,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
  `);
  await client.execute(`
    CREATE TABLE worktree_creation_jobs (
      chat_id TEXT PRIMARY KEY,
      error TEXT,
      error_code TEXT,
      job_id TEXT NOT NULL,
      progress INTEGER NOT NULL,
      related_chat_id TEXT,
      setup_approval TEXT,
      worktree_ref TEXT,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
  `);
  await client.execute(`
    CREATE TABLE queued_chat_runs (
      run_id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      input TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'queued',
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    )
  `);
  return drizzle(client, {
    schema: {
      chatDiffAnchors,
      chats,
      customAgents,
      projects,
      queuedChatRuns,
      pullRequests,
      worktreeCreationJobs,
    },
  }) as AppDatabase;
}

async function seedChat(
  database: AppDatabase,
  overrides: { id?: string; title: string; updatedAt?: string },
): Promise<void> {
  const timestamp = overrides.updatedAt ?? "2026-01-01T00:00:00.000Z";
  await database.insert(chats).values({
    archived: false,
    createdAt: timestamp,
    cwd: null,
    id: overrides.id ?? "chat-1",
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: overrides.title,
    updatedAt: timestamp,
  });
}

async function storedTitle(database: AppDatabase): Promise<string | undefined> {
  const row = await database
    .select()
    .from(chats)
    .where(eq(chats.id, "chat-1"))
    .get();
  return row?.title;
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
