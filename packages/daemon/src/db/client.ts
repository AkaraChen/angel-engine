import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import is from "@sindresorhus/is";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import { chats, customAgents, projects } from "./schema";

type AppDatabase = LibSQLDatabase<{
  chats: typeof chats;
  customAgents: typeof customAgents;
  projects: typeof projects;
}>;

let client: Client | undefined;
let databasePromise: Promise<AppDatabase> | undefined;
let configuration: DatabaseConfiguration | undefined;

export interface DatabaseConfiguration {
  dataDir: string;
  migrationsDir: string;
  packaged: boolean;
}

export function configureDatabase(next: DatabaseConfiguration) {
  if (databasePromise !== undefined)
    throw new Error("Database is already open.");
  configuration = next;
}

export function getDatabase() {
  databasePromise ??= openDatabase();
  return databasePromise;
}

async function openDatabase(): Promise<AppDatabase> {
  const current = requireConfiguration();
  fs.mkdirSync(current.dataDir, { recursive: true });

  const databasePath = path.join(
    current.dataDir,
    current.packaged ? "angel-engine.sqlite" : "angel-engine.dev.sqlite",
  );
  const nextClient = createClient({ url: pathToFileURL(databasePath).href });
  client = nextClient;
  try {
    await nextClient.execute("PRAGMA journal_mode = WAL");
    await nextClient.execute("PRAGMA foreign_keys = ON");

    const database = drizzle(nextClient, {
      schema: { chats, customAgents, projects },
    });
    await migrate(database, {
      migrationsFolder: resolveMigrationsFolder(current),
    });
    return database;
  } catch (error) {
    nextClient.close();
    client = undefined;
    databasePromise = undefined;
    throw error;
  }
}

export async function closeDatabase() {
  if (databasePromise !== undefined) {
    await databasePromise.catch(() => undefined);
  }
  client?.close();
  client = undefined;
  databasePromise = undefined;
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
