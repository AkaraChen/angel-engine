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
import { getDatabase } from "../../db/client";
import { chats, customAgents } from "../../db/schema";

export async function listCustomAgents(): Promise<CustomAgent[]> {
  const database = await getDatabase();
  const agents = await database.select().from(customAgents).all();
  return agents.map(customAgentFromRow);
}

export async function getCustomAgent(id: string): Promise<CustomAgent | null> {
  const database = await getDatabase();
  const agent = await database
    .select()
    .from(customAgents)
    .where(eq(customAgents.id, requireCustomAgentId(id)))
    .limit(1)
    .get();

  return agent ? customAgentFromRow(agent) : null;
}

export async function createCustomAgent(
  input: CreateCustomAgentInput,
): Promise<CustomAgent> {
  const now = new Date().toISOString();
  const database = await getDatabase();
  const agent = await database
    .insert(customAgents)
    .values({
      args: JSON.stringify(normalizeStringList(input.args)),
      autoAuthenticate: input.autoAuthenticate ?? false,
      command: normalizeRequiredString(input.command, "Command"),
      createdAt: now,
      environment: JSON.stringify(normalizeEnvironment(input.environment)),
      id: customAgentId(),
      label: normalizeRequiredString(input.label, "Agent name"),
      needAuth: input.needAuth ?? false,
      updatedAt: now,
    })
    .returning()
    .get();

  return customAgentFromRow(agent);
}

export async function updateCustomAgent(
  input: UpdateCustomAgentInput,
): Promise<CustomAgent> {
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
    patch.command = normalizeRequiredString(input.command, "Command");
  }
  if (input.environment !== undefined) {
    patch.environment = JSON.stringify(normalizeEnvironment(input.environment));
  }
  if (input.label !== undefined) {
    patch.label = normalizeRequiredString(input.label, "Agent name");
  }
  if (input.needAuth !== undefined) {
    patch.needAuth = input.needAuth;
  }

  const database = await getDatabase();
  const agent = await database
    .update(customAgents)
    .set(patch)
    .where(eq(customAgents.id, requireCustomAgentId(input.id)))
    .returning()
    .get();

  if (is.falsy(agent)) {
    throw new Error("Custom agent not found.");
  }
  return customAgentFromRow(agent);
}

export async function customAgentDeleteImpact(
  id: string,
): Promise<DeleteCustomAgentImpact> {
  const chatIds = await chatIdsForCustomAgent(id);
  return {
    chatCount: chatIds.length,
  };
}

export async function deleteCustomAgentWithChats(
  id: string,
): Promise<string[]> {
  const agentId = requireCustomAgentId(id);
  const agent = await getCustomAgent(agentId);
  if (agent === null) {
    throw new Error("Custom agent not found.");
  }
  const deletedChatIds = await chatIdsForCustomAgent(agentId);

  const database = await getDatabase();
  await database.transaction(async (tx) => {
    await tx.delete(chats).where(eq(chats.runtime, agentId)).run();
    await tx.delete(customAgents).where(eq(customAgents.id, agentId)).run();
  });

  return deletedChatIds;
}

async function chatIdsForCustomAgent(id: string): Promise<string[]> {
  const database = await getDatabase();
  const agentChats = await database
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.runtime, requireCustomAgentId(id)))
    .all();
  return agentChats.map((chat) => chat.id);
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

function requireCustomAgentId(id: string): CustomAgentRuntime {
  if (!id.startsWith("custom:") || id.length <= "custom:".length) {
    throw new Error("Custom agent id is required.");
  }
  return id as CustomAgentRuntime;
}

function normalizeRequiredString(value: string | undefined, label: string) {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!is.nonEmptyString(normalized)) {
    throw new Error(`${label} is required.`);
  }
  return normalized;
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
