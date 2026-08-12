import type { AppDatabase } from "../../../platform/db";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { providerHostMappings } from "../../../db/schema";
import { Db } from "../../../platform/db";
import {
  deleteProviderHostMapping,
  listProviderHostMappings,
  readSourceControlProjectConfig,
  setProviderHostMapping,
  writeSourceControlProjectConfig,
} from "./config-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

describe("source-control configuration store", () => {
  it("round-trips strict project configuration and rejects credentials", async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "source-control-config-"),
    );
    roots.push(root);
    await expect(readSourceControlProjectConfig(root)).resolves.toEqual({});
    await writeSourceControlProjectConfig(root, {
      provider: { providerId: "gitlab", remote: "origin" },
    });
    await expect(readSourceControlProjectConfig(root)).resolves.toEqual({
      provider: { providerId: "gitlab", remote: "origin" },
    });

    await expect(
      writeSourceControlProjectConfig(root, {
        provider: {
          providerId: "gitlab",
          remote: "origin",
          token: "forbidden",
        },
      } as never),
    ).rejects.toThrow("configuration is invalid");
  });

  it("persists normalized self-hosted host mappings", async () => {
    const client = createClient({ url: ":memory:" });
    await client.execute(
      "CREATE TABLE provider_host_mappings (host TEXT PRIMARY KEY NOT NULL, provider_id TEXT NOT NULL)",
    );
    const database = drizzle(client, {
      schema: { providerHostMappings },
    }) as unknown as AppDatabase;
    const run = <A>(effect: Effect.Effect<A, unknown, Db>) =>
      Effect.runPromise(
        effect.pipe(
          Effect.provideService(
            Db,
            new Db({ database: Effect.succeed(database) }),
          ),
        ),
      );

    await run(
      setProviderHostMapping({
        host: "CODE.ACME.INTERNAL",
        providerId: "gitlab",
      }),
    );
    await expect(run(listProviderHostMappings())).resolves.toEqual([
      { host: "code.acme.internal", providerId: "gitlab" },
    ]);
    await run(deleteProviderHostMapping("code.acme.internal"));
    await expect(run(listProviderHostMappings())).resolves.toEqual([]);
    client.close();
  });
});
