import type { ClientUpdate } from "@angel-engine/client-napi";
import { EngineEventElicitationDecision } from "@angel-engine/client-napi";
import type {
  Options as ClaudeQueryOptions,
  PermissionMode,
} from "@anthropic-ai/claude-agent-sdk";

import type { ChatElicitationResponse } from "../../../../shared/chat";
import type { EngineEventJson, JsonObject } from "./types";

export function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function labelFromValue(value: string): string {
  const spaced = value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return spaced
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "xhigh") return "XHigh";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function compactEvents(
  events: Array<EngineEventJson | undefined>,
): EngineEventJson[] {
  return events.filter((event): event is EngineEventJson => Boolean(event));
}

export function additionalDirectoriesFromFields(
  fields: Record<string, unknown>,
): string[] {
  const count = Number(fields.additionalDirectoryCount ?? 0);
  const directories: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const directory = stringField(fields, `additionalDirectory.${index}`);
    if (directory) directories.push(directory);
  }
  return directories;
}

export function stringField(
  value: Record<string, unknown>,
  field: string,
): string | undefined {
  const fieldValue = value[field];
  return typeof fieldValue === "string" ? fieldValue : undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return isJsonObject(value) ? value : {};
}

export function asObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

export function asMutableObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) return {};
  return value;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function emptyUpdate(): ClientUpdate {
  return {
    completedRequestIds: [],
    events: [],
    logs: [],
    outgoing: [],
    streamDeltas: [],
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw abortError(signal);
  }
}

export function abortError(signal?: AbortSignal) {
  if (signal?.reason instanceof Error) {
    return signal.reason;
  }
  const error = new Error("Chat request cancelled.");
  error.name = "AbortError";
  return error;
}

export function permissionDecision(response: ChatElicitationResponse): unknown {
  switch (response.type) {
    case "allow":
      return EngineEventElicitationDecision.Allow;
    case "allowForSession":
      return EngineEventElicitationDecision.AllowForSession;
    case "answers":
      return {
        [EngineEventElicitationDecision.Answers]: response.answers.map(
          (answer) => ({
            id: answer.id,
            value: answer.value,
          }),
        ),
      };
    case "cancel":
      return EngineEventElicitationDecision.Cancel;
    default:
      return EngineEventElicitationDecision.Deny;
  }
}

export function normalizeClaudeMode(
  mode: string | null | undefined,
): PermissionMode {
  return (mode || "default") as PermissionMode;
}

export function claudeEffort(
  effort: string | null | undefined,
): NonNullable<ClaudeQueryOptions["effort"]> | undefined {
  return effort
    ? (effort as NonNullable<ClaudeQueryOptions["effort"]>)
    : undefined;
}
