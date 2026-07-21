import type {
  CreateCustomAgentInput,
  CustomAgent,
  CustomAgentEnvironmentVariable,
  CustomAgentRuntime,
  DeleteCustomAgentImpact,
  UpdateCustomAgentInput,
} from "@angel-engine/daemon-api/agents";
import { randomUUID } from "node:crypto";

import is from "@sindresorhus/is";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { chats, customAgents } from "../../db/schema";
import { type Db, withDatabase } from "../../platform/db";
import { DaemonError } from "../../platform/errors";

export function listCustomAgents(): Effect.Effect<
  CustomAgent[],
  DaemonError,
  Db
> {
  return Effect.map(
    withDatabase((database) => database.select().from(customAgents).all()),
    (agents) => agents.map(customAgentFromRow),
  );
}

export function getCustomAgent(
  id: string,
): Effect.Effect<CustomAgent | null, DaemonError, Db> {
  return Effect.gen(function* () {
    const agentId = yield* requireCustomAgentId(id);
    const agent = yield* withDatabase((database) =>
      database
        .select()
        .from(customAgents)
        .where(eq(customAgents.id, agentId))
        .limit(1)
        .get(),
    );
    return agent ? customAgentFromRow(agent) : null;
  });
}

export function createCustomAgent(
  input: CreateCustomAgentInput,
): Effect.Effect<CustomAgent, DaemonError, Db> {
  return Effect.gen(function* () {
    const now = new Date().toISOString();
    const command = yield* normalizeRequiredString(input.command, "Command");
    const label = yield* normalizeRequiredString(input.label, "Agent name");
    const agent = yield* withDatabase((database) =>
      database
        .insert(customAgents)
        .values({
          args: JSON.stringify(normalizeStringList(input.args)),
          autoAuthenticate: input.autoAuthenticate ?? false,
          command,
          createdAt: now,
          environment: JSON.stringify(normalizeEnvironment(input.environment)),
          id: customAgentId(),
          label,
          needAuth: input.needAuth ?? false,
          updatedAt: now,
        })
        .returning()
        .get(),
    );

    return customAgentFromRow(agent);
  });
}

export function updateCustomAgent(
  input: UpdateCustomAgentInput,
): Effect.Effect<CustomAgent, DaemonError, Db> {
  return Effect.gen(function* () {
    const patch: Partial<typeof customAgents.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.args !== undefined) {
      patch.args = JSON.stringify(normalizeStringList(input.args));
    }
    if (input.autoAuthenticate !== undefined) {
      patch.autoAuthenticate = input.autoAuthenticate;
    }
    if (input.command !== undefined) {
      patch.command = yield* normalizeRequiredString(input.command, "Command");
    }
    if (input.environment !== undefined) {
      patch.environment = JSON.stringify(
        normalizeEnvironment(input.environment),
      );
    }
    if (input.label !== undefined) {
      patch.label = yield* normalizeRequiredString(input.label, "Agent name");
    }
    if (input.needAuth !== undefined) {
      patch.needAuth = input.needAuth;
    }

    const agentId = yield* requireCustomAgentId(input.id);
    const agent = yield* withDatabase((database) =>
      database
        .update(customAgents)
        .set(patch)
        .where(eq(customAgents.id, agentId))
        .returning()
        .get(),
    );

    if (is.falsy(agent)) {
      return yield* Effect.fail(DaemonError.customAgentNotFound());
    }
    return customAgentFromRow(agent);
  });
}

export function customAgentDeleteImpact(
  id: string,
): Effect.Effect<DeleteCustomAgentImpact, DaemonError, Db> {
  return Effect.map(chatIdsForCustomAgent(id), (chatIds) => ({
    chatCount: chatIds.length,
  }));
}

export function deleteCustomAgentWithChats(
  id: string,
): Effect.Effect<string[], DaemonError, Db> {
  return Effect.gen(function* () {
    const agentId = yield* requireCustomAgentId(id);
    const agent = yield* getCustomAgent(agentId);
    if (agent === null) {
      return yield* Effect.fail(DaemonError.customAgentNotFound());
    }
    const deletedChatIds = yield* chatIdsForCustomAgent(agentId);

    yield* withDatabase((database) =>
      database.transaction(async (tx) => {
        await tx.delete(chats).where(eq(chats.runtime, agentId)).run();
        await tx.delete(customAgents).where(eq(customAgents.id, agentId)).run();
      }),
    );

    return deletedChatIds;
  });
}

function chatIdsForCustomAgent(
  id: string,
): Effect.Effect<string[], DaemonError, Db> {
  return Effect.gen(function* () {
    const agentId = yield* requireCustomAgentId(id);
    const agentChats = yield* withDatabase((database) =>
      database
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.runtime, agentId))
        .all(),
    );
    return agentChats.map((chat) => chat.id);
  });
}

function customAgentFromRow(
  row: typeof customAgents.$inferSelect,
): CustomAgent {
  return {
    args: parseStringList(row.args),
    autoAuthenticate: row.autoAuthenticate,
    command: row.command,
    createdAt: row.createdAt,
    environment: parseEnvironment(row.environment),
    id: row.id as CustomAgentRuntime,
    label: row.label,
    needAuth: row.needAuth,
    updatedAt: row.updatedAt,
  };
}

function customAgentId(): CustomAgentRuntime {
  return `custom:${randomUUID()}`;
}

function requireCustomAgentId(
  id: string,
): Effect.Effect<CustomAgentRuntime, DaemonError> {
  if (!id.startsWith("custom:") || id.length <= "custom:".length) {
    return Effect.fail(DaemonError.customAgentIdRequired());
  }
  return Effect.succeed(id as CustomAgentRuntime);
}

function normalizeRequiredString(
  value: string | undefined,
  label: string,
): Effect.Effect<string, DaemonError> {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!is.nonEmptyString(normalized)) {
    return Effect.fail(DaemonError.customAgentFieldRequired(label));
  }
  return Effect.succeed(normalized);
}

function normalizeStringList(value: string[] | undefined): string[] {
  if (!value) return [];
  return value.map((item) => item.trim()).filter(Boolean);
}

function normalizeEnvironment(
  value: CustomAgentEnvironmentVariable[] | undefined,
): CustomAgentEnvironmentVariable[] {
  if (!value) return [];
  return value.flatMap((item) => {
    const name = item.name.trim();
    if (!name) return [];
    return [{ name, value: item.value }];
  });
}

function parseStringList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseEnvironment(value: string): CustomAgentEnvironmentVariable[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item): CustomAgentEnvironmentVariable[] => {
      if (item === null || typeof item !== "object") {
        return [];
      }
      const record = item as Record<string, unknown>;
      if (typeof record.name !== "string" || typeof record.value !== "string") {
        return [];
      }
      return [{ name: record.name, value: record.value }];
    });
  } catch {
    return [];
  }
}
