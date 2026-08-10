import type { AppDatabase } from "../../platform/db";
import type { DaemonError } from "../../platform/errors";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Cause, Effect, Exit, Layer } from "effect";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { chats, customAgents, projects } from "../../db/schema";
import { Db } from "../../platform/db";
import {
  deleteProjectWithChats,
  getProjectDeleteImpact,
  projectDeleteRevision,
} from "./repository";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("projectDeleteRevision", () => {
  it("is order-insensitive and changes with the chat set", () => {
    const first = projectDeleteRevision(["b", "a"]);
    expect(first).toBe(projectDeleteRevision(["a", "b"]));
    expect(first).not.toBe(projectDeleteRevision(["a"]));
    expect(first).not.toBe(projectDeleteRevision(["a", "b", "c"]));
    expect(projectDeleteRevision([])).not.toBe(first);
  });
});

describe("getProjectDeleteImpact", () => {
  it("reports the linked-chat count and a revision for the exact set", async () => {
    const database = await fileDatabase();
    await seedProject(database, "project-1");
    await seedChat(database, { id: "chat-1", projectId: "project-1" });
    await seedChat(database, { id: "chat-2", projectId: "project-1" });
    await seedChat(database, { id: "chat-3", projectId: null });

    const impact = await runWithDatabase(
      database,
      getProjectDeleteImpact("project-1"),
    );

    expect(impact.chatCount).toBe(2);
    expect(impact.revision).toBe(projectDeleteRevision(["chat-1", "chat-2"]));

    await seedChat(database, { id: "chat-4", projectId: "project-1" });
    const updated = await runWithDatabase(
      database,
      getProjectDeleteImpact("project-1"),
    );
    expect(updated.chatCount).toBe(3);
    expect(updated.revision).not.toBe(impact.revision);
  });

  it("fails with project-not-found for a missing project", async () => {
    const database = await fileDatabase();

    await expect(
      runWithDatabase(database, getProjectDeleteImpact("missing")),
    ).rejects.toMatchObject({ code: "project-not-found" });
  });
});

describe("deleteProjectWithChats", () => {
  it("deletes the project and exactly the linked chats in one transaction", async () => {
    const database = await fileDatabase();
    await seedProject(database, "project-1");
    await seedProject(database, "project-2");
    await seedChat(database, { id: "chat-1", projectId: "project-1" });
    await seedChat(database, { id: "chat-2", projectId: "project-1" });
    await seedChat(database, { id: "chat-3", projectId: "project-2" });

    const impact = await runWithDatabase(
      database,
      getProjectDeleteImpact("project-1"),
    );
    const deleted = await runWithDatabase(
      database,
      deleteProjectWithChats({
        expectedRevision: impact.revision,
        id: "project-1",
      }),
    );

    expect(deleted.map((chat) => chat.id).sort()).toEqual(["chat-1", "chat-2"]);
    await expect(database.select().from(projects).all()).resolves.toEqual([
      expect.objectContaining({ id: "project-2" }),
    ]);
    await expect(database.select().from(chats).all()).resolves.toEqual([
      expect.objectContaining({ id: "chat-3" }),
    ]);
  });

  it("rejects a stale revision and deletes nothing", async () => {
    const database = await fileDatabase();
    await seedProject(database, "project-1");
    await seedChat(database, { id: "chat-1", projectId: "project-1" });
    const impact = await runWithDatabase(
      database,
      getProjectDeleteImpact("project-1"),
    );
    // A chat created after the impact was read must not be silently deleted.
    await seedChat(database, { id: "chat-2", projectId: "project-1" });

    await expect(
      runWithDatabase(
        database,
        deleteProjectWithChats({
          expectedRevision: impact.revision,
          id: "project-1",
        }),
      ),
    ).rejects.toMatchObject({ code: "project-delete-conflict" });

    await expect(database.select().from(projects).all()).resolves.toHaveLength(
      1,
    );
    await expect(database.select().from(chats).all()).resolves.toHaveLength(2);
  });

  it("rejects the empty-set revision once a chat exists", async () => {
    const database = await fileDatabase();
    await seedProject(database, "project-1");
    const emptyImpact = await runWithDatabase(
      database,
      getProjectDeleteImpact("project-1"),
    );
    expect(emptyImpact.chatCount).toBe(0);
    await seedChat(database, { id: "chat-1", projectId: "project-1" });

    await expect(
      runWithDatabase(
        database,
        deleteProjectWithChats({
          expectedRevision: emptyImpact.revision,
          id: "project-1",
        }),
      ),
    ).rejects.toMatchObject({ code: "project-delete-conflict" });
  });

  it("deletes a chatless project with the empty-set revision", async () => {
    const database = await fileDatabase();
    await seedProject(database, "project-1");
    const impact = await runWithDatabase(
      database,
      getProjectDeleteImpact("project-1"),
    );

    const deleted = await runWithDatabase(
      database,
      deleteProjectWithChats({
        expectedRevision: impact.revision,
        id: "project-1",
      }),
    );

    expect(deleted).toEqual([]);
    await expect(database.select().from(projects).all()).resolves.toHaveLength(
      0,
    );
  });

  it("fails with project-not-found for a missing project", async () => {
    const database = await fileDatabase();

    await expect(
      runWithDatabase(
        database,
        deleteProjectWithChats({
          expectedRevision: projectDeleteRevision([]),
          id: "missing",
        }),
      ),
    ).rejects.toMatchObject({ code: "project-not-found" });
  });
});

async function fileDatabase(): Promise<AppDatabase> {
  // Transactions open their own connection, which never sees `:memory:` state.
  const dir = await mkdtemp(path.join(os.tmpdir(), "angel-projects-repo-"));
  tempDirs.push(dir);
  const client = createClient({
    url: pathToFileURL(path.join(dir, "test.sqlite")).href,
  });
  await client.execute("PRAGMA foreign_keys = ON");
  await client.execute(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE
    )
  `);
  await client.execute(`
    CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
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

async function seedProject(database: AppDatabase, id: string): Promise<void> {
  await database.insert(projects).values({ id, path: `/tmp/${id}` });
}

async function seedChat(
  database: AppDatabase,
  overrides: { id: string; projectId: string | null },
): Promise<void> {
  const timestamp = "2026-01-01T00:00:00.000Z";
  await database.insert(chats).values({
    archived: false,
    createdAt: timestamp,
    cwd: null,
    id: overrides.id,
    pinned: false,
    projectId: overrides.projectId,
    remoteThreadId: null,
    runtime: "codex",
    title: overrides.id,
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
