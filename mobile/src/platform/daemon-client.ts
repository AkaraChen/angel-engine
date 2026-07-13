import type {
  CreateChatInput,
  DaemonAgentOption,
  DaemonChat,
  DaemonProject,
} from "./chat-types";
import type { DaemonConfig } from "./daemon-config";

/**
 * Typed fetch client for the desktop daemon HTTP API.
 *
 * These DTOs mirror the daemon's `/api` response contract
 * (`packages/daemon/src/server.ts`). They are kept local because `mobile` is a
 * browser bundle and must not depend on the native `@angel-engine/daemon`
 * package; treat this file as the HTTP boundary for the daemon.
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
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  health: () => Promise<DaemonHealth>;
  listProcesses: () => Promise<ProcessRegistrySnapshot>;
  listChats: () => Promise<DaemonChat[]>;
  listProjects: () => Promise<DaemonProject[]>;
  listAgents: () => Promise<DaemonAgentOption[]>;
  createChat: (input: CreateChatInput) => Promise<DaemonChat>;
}

export function createDaemonClient(config: DaemonConfig): DaemonClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (config.token !== null) {
      headers.set("authorization", `Bearer ${config.token}`);
    }
    if (!headers.has("content-type") && init.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      throw new DaemonRequestError(
        `Daemon request failed: ${init.method ?? "GET"} ${path}`,
        response.status,
      );
    }

    // When the mobile app is served by a plain static server (not the daemon),
    // unknown routes fall back to `index.html`. Guard against parsing that HTML
    // as JSON so the failure is legible instead of an opaque parse error.
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
    request,
    health: async () => request<DaemonHealth>("/api/health"),
    listProcesses: async () =>
      request<ProcessRegistrySnapshot>("/api/process-registry"),
    listChats: async () => request<DaemonChat[]>("/api/chats"),
    listProjects: async () => request<DaemonProject[]>("/api/projects"),
    listAgents: async () => request<DaemonAgentOption[]>("/api/agents"),
    createChat: async (input) =>
      request<DaemonChat>("/api/chats", {
        method: "POST",
        body: JSON.stringify(input),
      }),
  };
}
