import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import is from "@sindresorhus/is";
import BetterSqliteDatabase from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { chats, customAgents, projects } from "./schema";

type AppDatabase = BetterSQLite3Database<{
  chats: typeof chats;
  customAgents: typeof customAgents;
  projects: typeof projects;
}>;

let sqlite: BetterSqliteDatabase.Database | undefined;
let db: AppDatabase | undefined;
let configuration: DatabaseConfiguration | undefined;

export interface DatabaseConfiguration {
  dataDir: string;
  migrationsDir: string;
  packaged: boolean;
}

export function configureDatabase(next: DatabaseConfiguration) {
  if (db !== undefined) throw new Error("Database is already open.");
  configuration = next;
}

export function getDatabase() {
  if (db) return db;

  const current = requireConfiguration();
  const dbDirectory = current.dataDir;
  fs.mkdirSync(dbDirectory, { recursive: true });

  sqlite = new BetterSqliteDatabase(
    path.join(
      dbDirectory,
      current.packaged ? "angel-engine.sqlite" : "angel-engine.dev.sqlite",
    ),
  );
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema: { chats, customAgents, projects } });
  migrate(db, { migrationsFolder: resolveMigrationsFolder(current) });
  return db;
}

export function closeDatabase() {
  sqlite?.close();
  sqlite = undefined;
  db = undefined;
}

function resolveMigrationsFolder(current: DatabaseConfiguration) {
  if (
    !is.nonEmptyString(current.migrationsDir) ||
    !fs.existsSync(path.join(current.migrationsDir, "meta", "_journal.json"))
  ) {
    throw new Error("Drizzle migrations folder not found.");
  }
  return current.migrationsDir;
}

function requireConfiguration() {
  if (configuration === undefined) {
    throw new Error("Database has not been configured.");
  }
  return configuration;
}
