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

export function listCustomAgents(): CustomAgent[] {
  return getDatabase()
    .select()
    .from(customAgents)
    .all()
    .map(customAgentFromRow);
}

export function getCustomAgent(id: string): CustomAgent | null {
  const agent = getDatabase()
    .select()
    .from(customAgents)
    .where(eq(customAgents.id, requireCustomAgentId(id)))
    .limit(1)
    .get();

  return agent ? customAgentFromRow(agent) : null;
}

export function createCustomAgent(input: CreateCustomAgentInput): CustomAgent {
  const now = new Date().toISOString();
  const agent = getDatabase()
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

export function updateCustomAgent(input: UpdateCustomAgentInput): CustomAgent {
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

  const agent = getDatabase()
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

export function customAgentDeleteImpact(id: string): DeleteCustomAgentImpact {
  return {
    chatCount: chatIdsForCustomAgent(id).length,
  };
}

export function deleteCustomAgentWithChats(id: string): string[] {
  const agentId = requireCustomAgentId(id);
  if (!getCustomAgent(agentId)) {
    throw new Error("Custom agent not found.");
  }
  const deletedChatIds = chatIdsForCustomAgent(agentId);

  getDatabase().transaction((tx) => {
    tx.delete(chats).where(eq(chats.runtime, agentId)).run();
    tx.delete(customAgents).where(eq(customAgents.id, agentId)).run();
  });

  return deletedChatIds;
}

function chatIdsForCustomAgent(id: string): string[] {
  return getDatabase()
    .select({ id: chats.id })
    .from(chats)
    .where(eq(chats.runtime, requireCustomAgentId(id)))
    .all()
    .map((chat) => chat.id);
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
