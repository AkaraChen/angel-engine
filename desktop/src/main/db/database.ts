import BetterSqliteDatabase from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import { chats, projects } from './schema';

export type AppDatabase = BetterSQLite3Database<{
  chats: typeof chats;
  projects: typeof projects;
}>;

let sqlite: BetterSqliteDatabase.Database | undefined;
let db: AppDatabase | undefined;

export function getDatabase() {
  if (db) return db;

  const dbDirectory = app.getPath('userData');
  fs.mkdirSync(dbDirectory, { recursive: true });

  sqlite = new BetterSqliteDatabase(path.join(dbDirectory, 'angel-engine.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      path TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      project_id TEXT,
      cwd TEXT,
      runtime TEXT NOT NULL,
      remote_thread_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS chats_updated_at_idx
      ON chats (updated_at DESC);

    CREATE INDEX IF NOT EXISTS chats_project_id_idx
      ON chats (project_id);
  `);

  db = drizzle(sqlite, { schema: { chats, projects } });
  return db;
}

export function closeDatabase() {
  sqlite?.close();
  sqlite = undefined;
  db = undefined;
}
