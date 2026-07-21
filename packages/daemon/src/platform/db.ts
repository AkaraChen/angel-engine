import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import is from "@sindresorhus/is";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Context, Effect, Layer } from "effect";

import { chats, customAgents, projects } from "../db/schema";
import { DaemonError } from "./errors";

export type AppDatabase = LibSQLDatabase<{
  chats: typeof chats;
  customAgents: typeof customAgents;
  projects: typeof projects;
}> & { $client: Client };

export interface DatabaseConfiguration {
  dataDir: string;
  migrationsDir: string;
  packaged: boolean;
}

export class DbConfig extends Context.Tag("daemon/DbConfig")<
  DbConfig,
  DatabaseConfiguration
>() {}

export function dbConfigLayer(configuration: DatabaseConfiguration) {
  return Layer.succeed(DbConfig, configuration);
}

/**
 * Owns the libSQL client for the daemon lifetime: opens the database file,
 * applies PRAGMAs and Drizzle migrations on acquire, closes the client on
 * scope release.
 */
export class Db extends Effect.Service<Db>()("daemon/Db", {
  scoped: Effect.gen(function* () {
    const configuration = yield* DbConfig;
    const databasePath = path.join(
      configuration.dataDir,
      configuration.packaged
        ? "angel-engine.sqlite"
        : "angel-engine.dev.sqlite",
    );
    const client = yield* Effect.acquireRelease(
      Effect.try({
        catch: (cause) =>
          DaemonError.databaseFailed(cause, "Could not open the database."),
        try: () => {
          fs.mkdirSync(configuration.dataDir, { recursive: true });
          return createClient({ url: pathToFileURL(databasePath).href });
        },
      }),
      (activeClient) => Effect.sync(() => activeClient.close()),
    );
    yield* Effect.tryPromise({
      catch: (cause) =>
        DaemonError.databaseFailed(cause, "Could not initialize the database."),
      try: async () => {
        await client.execute("PRAGMA journal_mode = WAL");
        await client.execute("PRAGMA foreign_keys = ON");
      },
    });
    const database = drizzle(client, {
      schema: { chats, customAgents, projects },
    });
    const migrationsFolder = yield* resolveMigrationsFolder(configuration);
    yield* Effect.tryPromise({
      catch: (cause) =>
        DaemonError.databaseFailed(cause, "Database migration failed."),
      try: () => migrate(database, { migrationsFolder }),
    });
    return { database };
  }),
}) {}

/**
 * Runs a Drizzle query against the daemon database, mapping rejections to
 * `DaemonError.databaseFailed` with the underlying message.
 */
export function withDatabase<A>(run: (database: AppDatabase) => Promise<A>) {
  return Effect.gen(function* () {
    const { database } = yield* Db;
    return yield* Effect.tryPromise({
      catch: (cause) =>
        DaemonError.databaseFailed(cause, "Database operation failed."),
      try: () => run(database),
    });
  });
}

function resolveMigrationsFolder(configuration: DatabaseConfiguration) {
  return Effect.try({
    catch: (cause) =>
      DaemonError.databaseFailed(cause, "Drizzle migrations folder not found."),
    try: () => {
      if (
        !is.nonEmptyString(configuration.migrationsDir) ||
        !fs.existsSync(
          path.join(configuration.migrationsDir, "meta", "_journal.json"),
        )
      ) {
        throw new Error("Drizzle migrations folder not found.");
      }
      return configuration.migrationsDir;
    },
  });
}
