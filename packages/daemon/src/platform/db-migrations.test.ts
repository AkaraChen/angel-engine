import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { expect, it } from "vitest";

const migrationsDir = path.resolve(
  import.meta.dirname,
  "../../../../desktop/drizzle",
);

it("repairs automation tables skipped by the out-of-order migration", async () => {
  const temporaryDir = await mkdtemp(
    path.join(tmpdir(), "angel-migration-test-"),
  );
  const historicalMigrationsDir = path.join(temporaryDir, "migrations");
  await mkdir(path.join(historicalMigrationsDir, "meta"), { recursive: true });
  try {
    await copyMigrations(
      historicalMigrationsDir,
      (tag) =>
        ![
          "0010_odd_midnight",
          "0012_repair_automation_tables",
          "0013_pink_marrow",
        ].includes(tag),
    );

    const client = createClient({
      url: `file:${path.join(temporaryDir, "database.sqlite")}`,
    });
    await migrate(drizzle(client), {
      migrationsFolder: historicalMigrationsDir,
    });
    await migrate(drizzle(client), { migrationsFolder: migrationsDir });

    await expect(
      client.execute("SELECT * FROM automations"),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      client.execute("SELECT * FROM automation_runs"),
    ).resolves.toMatchObject({ rows: [] });
    client.close();
  } finally {
    await rm(temporaryDir, { force: true, recursive: true });
  }
});

it("preserves existing automation data when applying the repair", async () => {
  const temporaryDir = await mkdtemp(
    path.join(tmpdir(), "angel-migration-test-"),
  );
  const historicalMigrationsDir = path.join(temporaryDir, "migrations");
  await mkdir(path.join(historicalMigrationsDir, "meta"), { recursive: true });
  try {
    await copyMigrations(
      historicalMigrationsDir,
      (tag) => tag !== "0012_repair_automation_tables",
    );
    const client = createClient({
      url: `file:${path.join(temporaryDir, "database.sqlite")}`,
    });
    await migrate(drizzle(client), {
      migrationsFolder: historicalMigrationsDir,
    });
    await client.execute({
      args: [
        "automation-1",
        "Daily audit",
        "0 9 * * *",
        "Audit dependencies",
        "codex",
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:00.000Z",
      ],
      sql: `INSERT INTO automations
        (id, name, cron, prompt, runtime, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    });
    await client.execute({
      args: [
        "run-1",
        "automation-1",
        "manual",
        "succeeded",
        "2026-08-12T00:00:00.000Z",
        "2026-08-12T00:00:10.000Z",
      ],
      sql: `INSERT INTO automation_runs
        (id, automation_id, trigger, status, started_at, finished_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
    });

    await migrate(drizzle(client), { migrationsFolder: migrationsDir });

    await expect(
      client.execute("SELECT id, name, prompt FROM automations"),
    ).resolves.toMatchObject({
      rows: [
        {
          id: "automation-1",
          name: "Daily audit",
          prompt: "Audit dependencies",
        },
      ],
    });
    await expect(
      client.execute("SELECT id, automation_id, status FROM automation_runs"),
    ).resolves.toMatchObject({
      rows: [
        {
          automation_id: "automation-1",
          id: "run-1",
          status: "succeeded",
        },
      ],
    });
    client.close();
  } finally {
    await rm(temporaryDir, { force: true, recursive: true });
  }
});

it("adds provider mappings after the released automation repair", async () => {
  const temporaryDir = await mkdtemp(
    path.join(tmpdir(), "angel-migration-test-"),
  );
  const historicalMigrationsDir = path.join(temporaryDir, "migrations");
  await mkdir(path.join(historicalMigrationsDir, "meta"), { recursive: true });
  try {
    await copyMigrations(
      historicalMigrationsDir,
      (tag) => tag !== "0013_pink_marrow",
    );
    const client = createClient({
      url: `file:${path.join(temporaryDir, "database.sqlite")}`,
    });

    await migrate(drizzle(client), {
      migrationsFolder: historicalMigrationsDir,
    });
    await expect(
      client.execute("SELECT * FROM automations"),
    ).resolves.toMatchObject({ rows: [] });
    await expect(
      client.execute("SELECT * FROM provider_host_mappings"),
    ).rejects.toThrow();

    await migrate(drizzle(client), { migrationsFolder: migrationsDir });

    await expect(
      client.execute("SELECT host, provider_id FROM provider_host_mappings"),
    ).resolves.toMatchObject({ rows: [] });
    client.close();
  } finally {
    await rm(temporaryDir, { force: true, recursive: true });
  }
});

async function copyMigrations(
  targetDir: string,
  include: (tag: string) => boolean,
) {
  const journal = JSON.parse(
    await readFile(path.join(migrationsDir, "meta/_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };
  const historicalJournal = {
    ...journal,
    entries: journal.entries.filter(({ tag }) => include(tag)),
  };
  await writeFile(
    path.join(targetDir, "meta/_journal.json"),
    JSON.stringify(historicalJournal),
  );
  for (const { tag } of historicalJournal.entries) {
    await copyFile(
      path.join(migrationsDir, `${tag}.sql`),
      path.join(targetDir, `${tag}.sql`),
    );
  }
}
