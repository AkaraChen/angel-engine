import BetterSqliteDatabase from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import { chats, projects } from "./schema";

export type AppDatabase = BetterSQLite3Database<{
  chats: typeof chats;
  projects: typeof projects;
}>;

let sqlite: BetterSqliteDatabase.Database | undefined;
let db: AppDatabase | undefined;

export function getDatabase() {
  if (db) return db;

  const dbDirectory = app.getPath("userData");
  fs.mkdirSync(dbDirectory, { recursive: true });

  sqlite = new BetterSqliteDatabase(
    path.join(dbDirectory, "angel-engine.sqlite"),
  );
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema: { chats, projects } });
  migrate(db, { migrationsFolder: resolveMigrationsFolder() });
  return db;
}

export function closeDatabase() {
  sqlite?.close();
  sqlite = undefined;
  db = undefined;
}

function resolveMigrationsFolder() {
  const candidates = [
    path.join(app.getAppPath(), "drizzle"),
    path.join(process.cwd(), "drizzle"),
  ];

  const migrationsFolder = candidates.find((candidate) =>
    fs.existsSync(path.join(candidate, "meta", "_journal.json")),
  );

  if (!migrationsFolder) {
    throw new Error("Drizzle migrations folder not found.");
  }

  return migrationsFolder;
}
