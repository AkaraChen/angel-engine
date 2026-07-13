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
    return (await response.json()) as T;
  }

  return {
    baseUrl: config.baseUrl,
    request,
    health: async () => request<DaemonHealth>("/api/health"),
    listProcesses: async () =>
      request<ProcessRegistrySnapshot>("/api/process-registry"),
  };
}
