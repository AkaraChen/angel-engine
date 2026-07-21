import type { Client } from "@libsql/client";
import type { LibSQLDatabase } from "drizzle-orm/libsql";

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import is from "@sindresorhus/is";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { Context, Effect, Layer, Ref } from "effect";

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
 * Owns the libSQL client for the daemon lifetime. The database opens lazily on
 * first use (routes that never touch it must not fail when it cannot open,
 * and a failed open is retried on the next query); the scope finalizer closes
 * whatever was opened.
 */
export class Db extends Effect.Service<Db>()("daemon/Db", {
  scoped: Effect.gen(function* () {
    const configuration = yield* DbConfig;
    const openedRef = yield* Ref.make<AppDatabase | undefined>(undefined);
    const gate = yield* Effect.makeSemaphore(1);
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const opened = yield* Ref.get(openedRef);
        opened?.$client.close();
      }),
    );

    const database = gate.withPermits(1)(
      Effect.gen(function* () {
        const opened = yield* Ref.get(openedRef);
        if (opened !== undefined) return opened;
        const next = yield* openDatabase(configuration);
        yield* Ref.set(openedRef, next);
        return next;
      }),
    );

    return { database };
  }),
}) {}

/**
 * Runs a Drizzle query against the daemon database, mapping rejections to
 * `DaemonError.databaseFailed` with the underlying message.
 */
export function withDatabase<A>(run: (database: AppDatabase) => Promise<A>) {
  return Effect.gen(function* () {
    const database = yield* (yield* Db).database;
    return yield* Effect.tryPromise({
      catch: (cause) =>
        DaemonError.databaseFailed(cause, "Database operation failed."),
      try: () => run(database),
    });
  });
}

function openDatabase(
  configuration: DatabaseConfiguration,
): Effect.Effect<AppDatabase, DaemonError> {
  return Effect.gen(function* () {
    const databasePath = path.join(
      configuration.dataDir,
      configuration.packaged
        ? "angel-engine.sqlite"
        : "angel-engine.dev.sqlite",
    );
    const client = yield* Effect.try({
      catch: (cause) =>
        DaemonError.databaseFailed(cause, "Could not open the database."),
      try: () => {
        fs.mkdirSync(configuration.dataDir, { recursive: true });
        return createClient({ url: pathToFileURL(databasePath).href });
      },
    });
    return yield* Effect.gen(function* () {
      yield* Effect.tryPromise({
        catch: (cause) =>
          DaemonError.databaseFailed(
            cause,
            "Could not initialize the database.",
          ),
        try: async () => {
          await client.execute("PRAGMA journal_mode = WAL");
          await client.execute("PRAGMA foreign_keys = ON");
        },
      });
      const database = drizzle(client, {
        schema: { chats, customAgents, projects },
      }) as AppDatabase;
      const migrationsFolder = yield* resolveMigrationsFolder(configuration);
      yield* Effect.tryPromise({
        catch: (cause) =>
          DaemonError.databaseFailed(cause, "Database migration failed."),
        try: () => migrate(database, { migrationsFolder }),
      });
      return database;
    }).pipe(Effect.tapError(() => Effect.sync(() => client.close())));
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
