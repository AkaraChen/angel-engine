import type { AppDatabase } from "../../platform/db";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Cause, Effect, Exit, Fiber, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { chatDiffAnchors, chats } from "../../db/schema";
import { Db } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
import {
  getChatDiffAnchor,
  recordChatTurnStart,
  recordSessionDiffAnchor,
  recordTurnDiffAnchor,
  setTurnDiffAnchorTurnId,
} from "./diff-anchors";

let database: AppDatabase;

beforeEach(async () => {
  const client = createClient({ url: ":memory:" });
  await client.batch([
    `CREATE TABLE chats (
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
    )`,
    `CREATE TABLE chat_diff_anchors (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      sha TEXT NOT NULL,
      turn_id TEXT
    )`,
  ]);
  database = drizzle(client, {
    schema: { chatDiffAnchors, chats },
  }) as AppDatabase;
  await database.insert(chats).values({
    archived: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "chat-1",
    pinned: false,
    runtime: "codex",
    title: "Chat",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

describe("chat diff anchors", () => {
  it("keeps the first session SHA and the latest turn SHA", async () => {
    await run(recordSessionDiffAnchor("chat-1", "session-first"));
    await run(recordSessionDiffAnchor("chat-1", "session-later"));
    await run(recordTurnDiffAnchor("chat-1", "turn-1", "turn-first"));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await run(recordTurnDiffAnchor("chat-1", "turn-2", "turn-latest"));

    await expect(
      run(getChatDiffAnchor("chat-1", "session")),
    ).resolves.toMatchObject({
      sha: "session-first",
    });
    await expect(
      run(getChatDiffAnchor("chat-1", "turn")),
    ).resolves.toMatchObject({
      sha: "turn-latest",
      turnId: "turn-2",
    });
  });

  it("persists the turn start before a failed send", async () => {
    const send = recordChatTurnStart("chat-1", "failed-start").pipe(
      Effect.andThen(Effect.fail(DaemonError.chatInputRequired())),
    );

    await expect(run(send)).rejects.toBeDefined();
    await expect(
      run(getChatDiffAnchor("chat-1", "turn")),
    ).resolves.toMatchObject({ sha: "failed-start", turnId: null });
  });

  it("retains the turn start while running and after interruption", async () => {
    let markRunning = () => {};
    const running = new Promise<void>((resolve) => {
      markRunning = resolve;
    });
    const send = recordChatTurnStart("chat-1", "interrupted-start").pipe(
      Effect.tap(() => Effect.sync(markRunning)),
      Effect.andThen(Effect.never),
      Effect.provide(databaseLayer()),
    );
    const fiber = Effect.runFork(send);

    await running;
    await expect(
      run(getChatDiffAnchor("chat-1", "turn")),
    ).resolves.toMatchObject({ sha: "interrupted-start", turnId: null });
    await Effect.runPromise(Fiber.interrupt(fiber));
    await expect(
      run(getChatDiffAnchor("chat-1", "turn")),
    ).resolves.toMatchObject({ sha: "interrupted-start", turnId: null });
  });

  it("backfills the runtime turn id onto the pre-send anchor", async () => {
    const anchor = await run(recordChatTurnStart("chat-1", "turn-start"));
    await run(setTurnDiffAnchorTurnId(anchor.id, "turn-runtime"));

    await expect(
      run(getChatDiffAnchor("chat-1", "turn")),
    ).resolves.toMatchObject({ sha: "turn-start", turnId: "turn-runtime" });
  });
});

async function run<A>(effect: Effect.Effect<A, DaemonError, Db>): Promise<A> {
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provide(databaseLayer())),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

function databaseLayer() {
  return Layer.succeed(Db, new Db({ database: Effect.succeed(database) }));
}
