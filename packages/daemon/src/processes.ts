import type {
  ProcessRegistryEntry,
  ProcessRegistrySnapshotEntry,
} from "@angel-engine/daemon-api/daemon";

import {
  listListeningPorts,
  listSubprocesses,
} from "@angel-engine/client-napi";
import { Effect } from "effect";

import { DaemonError } from "./platform/errors";

class ProcessRegistry {
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

/** Tracks external process trees advertised by the desktop and live sessions. */
export class ProcessRegistryService extends Effect.Service<ProcessRegistryService>()(
  "daemon/ProcessRegistryService",
  {
    sync: () => {
      const registry = new ProcessRegistry();
      return {
        kill: (pid: number, force: boolean) =>
          Effect.try({
            catch: (cause) => DaemonError.internal(cause),
            try: () => registry.kill(pid, force),
          }),
        replace: (entries: ProcessRegistryEntry[]) =>
          Effect.sync(() => registry.replace(entries)),
        snapshot: () =>
          Effect.try({
            catch: (cause) => DaemonError.internal(cause),
            try: () => registry.snapshot(),
          }),
      };
    },
  },
) {}

export function parseRegistryBody(
  value: unknown,
): Effect.Effect<ProcessRegistryEntry[], DaemonError> {
  return Effect.gen(function* () {
    if (!isObject(value) || !Array.isArray(value.entries)) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Expected an object with an entries array."),
      );
    }
    const entries: ProcessRegistryEntry[] = [];
    for (const [index, entry] of value.entries.entries()) {
      if (
        !isObject(entry) ||
        typeof entry.id !== "string" ||
        entry.id.length === 0 ||
        typeof entry.label !== "string" ||
        entry.label.length === 0 ||
        !isProcessId(entry.rootPid)
      ) {
        return yield* Effect.fail(
          DaemonError.invalidRequest(
            `Invalid process registry entry at index ${index}.`,
          ),
        );
      }
      entries.push({
        id: entry.id,
        label: entry.label,
        rootPid: entry.rootPid,
      });
    }
    return entries;
  });
}

export function parseKillBody(
  value: unknown,
): Effect.Effect<{ force: boolean }, DaemonError> {
  if (value === undefined) return Effect.succeed({ force: false });
  if (
    !isObject(value) ||
    (value.force !== undefined && typeof value.force !== "boolean")
  ) {
    return Effect.fail(
      DaemonError.invalidRequest(
        "Expected an object with an optional boolean force field.",
      ),
    );
  }
  return Effect.succeed({ force: value.force ?? false });
}

export function isProcessId(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
