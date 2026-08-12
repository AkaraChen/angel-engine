import {
  sourceControlProjectConfigSchema,
  type ProviderHostMapping,
  type SourceControlProjectConfig,
} from "@angel-engine/daemon-api/source-control";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { type as arkType } from "arktype";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";

import { providerHostMappings } from "../../../db/schema";
import type { Db } from "../../../platform/db";
import { DaemonError } from "../../../platform/errors";
import { withDatabase } from "../../../platform/db";

export function projectProviderConfigPath(projectPath: string) {
  return path.join(projectPath, ".angel", "source-control.json");
}

export async function readSourceControlProjectConfig(
  projectPath: string,
): Promise<SourceControlProjectConfig> {
  const configPath = projectProviderConfigPath(projectPath);
  const source = await readFile(configPath, "utf8").catch(
    (cause: NodeJS.ErrnoException) => {
      if (cause.code === "ENOENT") return null;
      throw cause;
    },
  );
  if (source === null) return {};
  const parsed = sourceControlProjectConfigSchema(
    JSON.parse(source) as unknown,
  );
  if (parsed instanceof arkType.errors) {
    throw new Error("Source-control project configuration is invalid.");
  }
  return parsed;
}

export async function writeSourceControlProjectConfig(
  projectPath: string,
  config: SourceControlProjectConfig,
) {
  const parsed = sourceControlProjectConfigSchema(config);
  if (parsed instanceof arkType.errors) {
    throw new Error("Source-control project configuration is invalid.");
  }
  const configPath = projectProviderConfigPath(projectPath);
  const directory = path.dirname(configPath);
  const temporaryPath = `${configPath}.tmp`;
  await mkdir(directory, { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(parsed, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryPath, configPath);
  return parsed;
}

export function listProviderHostMappings(): Effect.Effect<
  ProviderHostMapping[],
  DaemonError,
  Db
> {
  return withDatabase(async (database) =>
    database
      .select({
        host: providerHostMappings.host,
        providerId: providerHostMappings.providerId,
      })
      .from(providerHostMappings)
      .orderBy(asc(providerHostMappings.host)),
  );
}

export function setProviderHostMapping(
  mapping: ProviderHostMapping,
): Effect.Effect<ProviderHostMapping, DaemonError, Db> {
  const normalized = {
    host: mapping.host.trim().toLowerCase(),
    providerId: mapping.providerId.trim(),
  };
  if (!normalized.host || !normalized.providerId) {
    return Effect.fail(DaemonError.invalidRequest("Host mapping is invalid."));
  }
  return withDatabase(async (database) => {
    await database
      .insert(providerHostMappings)
      .values(normalized)
      .onConflictDoUpdate({
        set: { providerId: normalized.providerId },
        target: providerHostMappings.host,
      });
    return normalized;
  });
}

export function deleteProviderHostMapping(host: string) {
  return withDatabase(async (database) => {
    await database
      .delete(providerHostMappings)
      .where(eq(providerHostMappings.host, host.trim().toLowerCase()));
  });
}
