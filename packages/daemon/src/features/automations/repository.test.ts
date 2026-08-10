import type { AppDatabase } from "../../platform/db";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import {
  automationRuns,
  automations,
  chatDiffAnchors,
  chats,
  customAgents,
  projects,
  queuedChatRuns,
  worktreeCreationJobs,
} from "../../db/schema";
import { Db } from "../../platform/db";
import {
  createAutomationRecord,
  createAutomationRun,
  deleteAutomationRecord,
  finishAutomationRun,
  getAutomation,
  listAutomations,
  updateAutomationRecord,
} from "./repository";

let database: AppDatabase;

beforeEach(async () => {
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  await client.batch([
    `CREATE TABLE projects (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE)`,
    `CREATE TABLE chats (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, project_id TEXT, cwd TEXT,
      runtime TEXT NOT NULL, remote_thread_id TEXT, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE automations (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, cron TEXT NOT NULL,
      prompt TEXT NOT NULL, runtime TEXT NOT NULL, project_id TEXT,
      workspace_kind TEXT NOT NULL DEFAULT 'project',
      notify_on_failure INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1, next_run_at TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE automation_runs (
      id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, chat_id TEXT,
      trigger TEXT NOT NULL, status TEXT NOT NULL, scheduled_for TEXT,
      started_at TEXT NOT NULL, finished_at TEXT, error TEXT,
      FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE SET NULL
    )`,
  ]);
  database = drizzle(client, {
    schema: {
      automationRuns,
      automations,
      chatDiffAnchors,
      chats,
      customAgents,
      projects,
      queuedChatRuns,
      worktreeCreationJobs,
    },
  }) as AppDatabase;
});

describe("automation repository", () => {
  it("persists definitions, pause state, history, and cascade deletion", async () => {
    const created = await run(
      createAutomationRecord(
        {
          cron: "0 9 * * *",
          name: "Dependency audit",
          prompt: "Audit dependencies",
          runtime: "codex",
        },
        "2026-08-11T01:00:00.000Z",
      ),
    );
    const listed = await run(listAutomations());
    expect(listed).toMatchObject([{ id: created.id, status: "active" }]);

    const paused = await run(
      updateAutomationRecord(created.id, { enabled: false }, null),
    );
    expect(paused).toMatchObject({ nextRunAt: null, status: "paused" });

    const history = await run(
      createAutomationRun({
        automationId: created.id,
        trigger: "manual",
      }),
    );
    await run(finishAutomationRun(history.id, "failed", "provider failed"));
    await run(updateAutomationRecord(created.id, { enabled: true }, null));
    await expect(run(getAutomation(created.id))).resolves.toMatchObject({
      runs: [{ error: "provider failed", status: "failed" }],
      status: "failing",
    });

    await run(deleteAutomationRecord(created.id));
    await expect(run(getAutomation(created.id))).resolves.toBeNull();
    await expect(database.select().from(automationRuns).all()).resolves.toEqual(
      [],
    );
  });

  it("retains definitions after reconnecting to the database", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "angel-automation-"));
    const url = `file:${path.join(directory, "daemon.sqlite")}`;
    const firstClient = createClient({ url });
    try {
      await firstClient.batch([
        `CREATE TABLE automations (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, cron TEXT NOT NULL,
          prompt TEXT NOT NULL, runtime TEXT NOT NULL, project_id TEXT,
          workspace_kind TEXT NOT NULL DEFAULT 'project',
          notify_on_failure INTEGER NOT NULL DEFAULT 1,
          enabled INTEGER NOT NULL DEFAULT 1, next_run_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE automation_runs (
          id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, chat_id TEXT,
          trigger TEXT NOT NULL, status TEXT NOT NULL, scheduled_for TEXT,
          started_at TEXT NOT NULL, finished_at TEXT, error TEXT,
          FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
        )`,
      ]);
      database = drizzle(firstClient, {
        schema: { automationRuns, automations },
      }) as AppDatabase;
      const created = await run(
        createAutomationRecord(
          {
            cron: "*/30 * * * *",
            name: "CI heartbeat",
            prompt: "Check CI",
            runtime: "codex",
          },
          new Date().toISOString(),
        ),
      );
      firstClient.close();

      const secondClient = createClient({ url });
      try {
        database = drizzle(secondClient, {
          schema: { automationRuns, automations },
        }) as AppDatabase;
        await expect(run(listAutomations())).resolves.toMatchObject([
          { id: created.id, name: "CI heartbeat" },
        ]);
      } finally {
        secondClient.close();
      }
    } finally {
      firstClient.close();
      await rm(directory, { force: true, recursive: true });
    }
  });
});

function run<A>(effect: Effect.Effect<A, unknown, Db>): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provideService(Db, new Db({ database: Effect.succeed(database) })),
    ),
  );
}
