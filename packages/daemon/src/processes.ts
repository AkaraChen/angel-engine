import type {
  ListeningPortInfo,
  SubprocessInfo,
} from "@angel-engine/client-napi";

import {
  listListeningPorts,
  listSubprocesses,
} from "@angel-engine/client-napi";

export interface ProcessRegistryEntry {
  id: string;
  label: string;
  rootPid: number;
}

export interface ProcessRegistrySnapshotEntry extends ProcessRegistryEntry {
  processes: SubprocessInfo[];
  ports: ListeningPortInfo[];
}

export class ProcessRegistry {
  readonly #entries = new Map<string, ProcessRegistryEntry>();

  replace(entries: ProcessRegistryEntry[]) {
    this.#entries.clear();
    for (const entry of entries) this.#entries.set(entry.id, entry);
  }

  snapshot(): ProcessRegistrySnapshotEntry[] {
    return [...this.#entries.values()].map((entry) => {
      const processes = listSubprocesses(entry.rootPid);
      const ports = listListeningPorts([
        entry.rootPid,
        ...processes.map((process) => process.pid),
      ]);
      return { ...entry, ports, processes };
    });
  }

  kill(pid: number, force: boolean) {
    if (!this.#containsCurrentProcess(pid)) return false;
    process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    return true;
  }

  #containsCurrentProcess(pid: number) {
    for (const entry of this.#entries.values()) {
      if (entry.rootPid === pid) return true;
      if (
        listSubprocesses(entry.rootPid).some((process) => process.pid === pid)
      ) {
        return true;
      }
    }
    return false;
  }
}

export function parseRegistryBody(value: unknown): ProcessRegistryEntry[] {
  if (!isObject(value) || !Array.isArray(value.entries)) {
    throw new Error("Expected an object with an entries array.");
  }
  return value.entries.map((entry, index) => {
    if (
      !isObject(entry) ||
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      typeof entry.label !== "string" ||
      entry.label.length === 0 ||
      !isProcessId(entry.rootPid)
    ) {
      throw new Error(`Invalid process registry entry at index ${index}.`);
    }
    return { id: entry.id, label: entry.label, rootPid: entry.rootPid };
  });
}

export function parseKillBody(value: unknown): { force: boolean } {
  if (value === undefined) return { force: false };
  if (
    !isObject(value) ||
    (value.force !== undefined && typeof value.force !== "boolean")
  ) {
    throw new Error("Expected an object with an optional boolean force field.");
  }
  return { force: value.force ?? false };
}

export function isProcessId(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
