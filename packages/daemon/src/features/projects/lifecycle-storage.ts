import type {
  ProjectLifecycleKind,
  ProjectLifecycleSnapshot,
} from "@angel-engine/daemon-api/projects";

import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import {
  cloneLifecycleSnapshot,
  errorCode,
  initialLifecycleSnapshot,
  isLifecycleSnapshot,
  LOG_TAIL_LENGTH,
  recoverInterruptedLifecycleSnapshot,
  tail,
} from "./lifecycle-model";

export interface LifecycleStorageRecord {
  logs: Partial<Record<ProjectLifecycleKind, string>>;
  mutationQueue: Promise<void>;
  snapshot: ProjectLifecycleSnapshot;
  storageDirectory: string;
  worktreePath: string;
}

interface LifecycleStorageOptions {
  root: string;
}

/** Secure persistence and serialization boundary for lifecycle state/logs. */
export class ProjectLifecycleStorage {
  readonly #recordPromises = new Map<string, Promise<LifecycleStorageRecord>>();
  readonly #root: string;

  constructor(options: LifecycleStorageOptions) {
    this.#root = path.resolve(options.root);
  }

  record(worktreePath: string): Promise<LifecycleStorageRecord> {
    const key = path.resolve(worktreePath);
    const existing = this.#recordPromises.get(key);
    if (existing !== undefined) return existing;
    const created = this.#loadRecord(key);
    this.#recordPromises.set(key, created);
    void created.catch(() => this.#recordPromises.delete(key));
    return created;
  }

  artifactDirectory(worktreePath: string) {
    return path.join(
      this.#root,
      createHash("sha256").update(path.resolve(worktreePath)).digest("hex"),
    );
  }

  async snapshot(worktreePath: string) {
    const record = await this.record(worktreePath);
    await record.mutationQueue;
    return cloneLifecycleSnapshot(record.snapshot);
  }

  async log(record: LifecycleStorageRecord, kind: ProjectLifecycleKind) {
    const cached = record.logs[kind];
    if (cached !== undefined) return cached;
    const logPath = path.join(record.storageDirectory, `${kind}.log`);
    try {
      await rejectSymlink(logPath);
      const value = tail(await fs.readFile(logPath, "utf8"), LOG_TAIL_LENGTH);
      record.logs[kind] = value;
      return value;
    } catch (cause) {
      if (errorCode(cause) === "ENOENT") return "";
      throw cause;
    }
  }

  async appendLog(
    record: LifecycleStorageRecord,
    kind: ProjectLifecycleKind,
    chunk: string,
  ) {
    const logPath = path.join(record.storageDirectory, `${kind}.log`);
    await rejectSymlink(logPath);
    const noFollow = fsConstants.O_NOFOLLOW ?? 0;
    const handle = await fs.open(
      logPath,
      fsConstants.O_APPEND |
        fsConstants.O_CREAT |
        fsConstants.O_WRONLY |
        noFollow,
      0o600,
    );
    try {
      await handle.writeFile(chunk, "utf8");
    } finally {
      await handle.close();
    }
  }

  update(
    record: LifecycleStorageRecord,
    onState: ((snapshot: ProjectLifecycleSnapshot) => void) | undefined,
    mutate: (snapshot: ProjectLifecycleSnapshot) => void,
  ): Promise<ProjectLifecycleSnapshot> {
    const operation = record.mutationQueue.then(async () => {
      const next = cloneLifecycleSnapshot(record.snapshot);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      await writeSnapshot(record.storageDirectory, next);
      record.snapshot = next;
      onState?.(cloneLifecycleSnapshot(next));
      return cloneLifecycleSnapshot(next);
    });
    record.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #loadRecord(worktreePath: string): Promise<LifecycleStorageRecord> {
    const storageDirectory = this.artifactDirectory(worktreePath);
    await secureDirectory(this.#root);
    await secureDirectory(storageDirectory);
    const snapshot = await readSnapshot(storageDirectory);
    const recovered = recoverInterruptedLifecycleSnapshot(snapshot);
    const record: LifecycleStorageRecord = {
      logs: {},
      mutationQueue: Promise.resolve(),
      snapshot: recovered,
      storageDirectory,
      worktreePath,
    };
    if (JSON.stringify(recovered) !== JSON.stringify(snapshot)) {
      recovered.updatedAt = new Date().toISOString();
      await writeSnapshot(storageDirectory, recovered);
    }
    return record;
  }
}

async function readSnapshot(storageDirectory: string) {
  const statePath = path.join(storageDirectory, "lifecycle.json");
  try {
    await rejectSymlink(statePath);
    const parsed = JSON.parse(await fs.readFile(statePath, "utf8")) as unknown;
    if (isLifecycleSnapshot(parsed)) return parsed;
    await quarantineCorruptState(statePath);
    return initialLifecycleSnapshot();
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") return initialLifecycleSnapshot();
    if (cause instanceof SyntaxError) {
      await quarantineCorruptState(statePath);
      return initialLifecycleSnapshot();
    }
    throw cause;
  }
}

async function writeSnapshot(
  storageDirectory: string,
  snapshot: ProjectLifecycleSnapshot,
) {
  const statePath = path.join(storageDirectory, "lifecycle.json");
  await rejectSymlink(statePath);
  const temporaryPath = path.join(
    storageDirectory,
    `lifecycle.${randomUUID()}.tmp`,
  );
  const noFollow = fsConstants.O_NOFOLLOW ?? 0;
  const handle = await fs.open(
    temporaryPath,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | noFollow,
    0o600,
  );
  try {
    await handle.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  } finally {
    await handle.close();
  }
  try {
    await fs.rename(temporaryPath, statePath);
  } catch (cause) {
    await fs.rm(temporaryPath, { force: true });
    throw cause;
  }
}

async function secureDirectory(directory: string) {
  await fs.mkdir(directory, { mode: 0o700, recursive: true });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(
      `Lifecycle storage is not a secure directory: ${directory}`,
    );
  }
}

async function rejectSymlink(file: string) {
  try {
    if ((await fs.lstat(file)).isSymbolicLink()) {
      throw new Error(`Lifecycle storage refuses symbolic links: ${file}`);
    }
  } catch (cause) {
    if (errorCode(cause) !== "ENOENT") throw cause;
  }
}

async function quarantineCorruptState(statePath: string) {
  await rejectSymlink(statePath);
  await fs.rename(
    statePath,
    `${statePath}.corrupt-${Date.now()}-${randomUUID()}`,
  );
}
