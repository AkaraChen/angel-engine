import type { AgentOption } from "@angel-engine/daemon-api/agents";
import type { Chat, ChatCreateInput } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { DaemonConfig } from "./daemon-config";

import { createDaemonApiClient } from "@angel-engine/daemon-api/client";

/**
 * The mobile daemon client. Chat/project/agent calls delegate to the shared
 * `@angel-engine/daemon-api` client so the wire contract and types stay in one
 * place; `health`/`listProcesses` stay local because they aren't part of that
 * client but the mobile status UI needs them. `daemon-api/client` is
 * runtime-safe in a browser bundle (its type imports are erased).
 */
export interface DaemonHealth {
  pid: number;
  uptime: number;
  version: string;
}

export interface ProcessRegistryEntry {
  pid: number;
  label?: string;
}

export interface ProcessRegistrySnapshot {
  entries: ProcessRegistryEntry[];
}

export class DaemonRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DaemonRequestError";
  }
}

export interface DaemonClient {
  readonly baseUrl: string;
  health: () => Promise<DaemonHealth>;
  listProcesses: () => Promise<ProcessRegistrySnapshot>;
  listChats: () => Promise<Chat[]>;
  listProjects: () => Promise<Project[]>;
  listAgents: () => Promise<AgentOption[]>;
  createChat: (input: ChatCreateInput) => Promise<Chat>;
}

export function createDaemonClient(config: DaemonConfig): DaemonClient {
  const authorizedFetch = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (config.token !== null) {
      headers.set("authorization", `Bearer ${config.token}`);
    }
    if (!headers.has("content-type") && init.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    return fetch(`${config.baseUrl}${path}`, { ...init, headers });
  };

  const api = createDaemonApiClient({ fetch: authorizedFetch });

  // Local request helper for the endpoints daemon-api doesn't wrap, with a
  // guard for the "served by a static server" case where unknown routes fall
  // back to index.html and would otherwise blow up as an opaque JSON error.
  async function request<T>(path: string): Promise<T> {
    const response = await authorizedFetch(path);
    if (!response.ok) {
      throw new DaemonRequestError(
        `Daemon request failed: GET ${path}`,
        response.status,
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new DaemonRequestError(
        `Daemon returned a non-JSON response for ${path} ` +
          `(content-type: ${contentType.length > 0 ? contentType : "unknown"}). ` +
          `Is the mobile app being served by the daemon?`,
        response.status,
      );
    }
    return (await response.json()) as T;
  }

  return {
    baseUrl: config.baseUrl,
    health: async () => request<DaemonHealth>("/api/health"),
    listProcesses: async () =>
      request<ProcessRegistrySnapshot>("/api/process-registry"),
    listChats: async () => api.chats.list(),
    listProjects: async () => api.projects.list(),
    listAgents: async () => api.agents.listAvailable(),
    createChat: async (input) => api.chats.create(input),
  };
}
