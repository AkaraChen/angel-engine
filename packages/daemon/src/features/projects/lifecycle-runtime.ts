import type {
  ProjectLifecycleKind,
  ProjectLifecycleSnapshot,
  ProjectSetupLifecycleContext,
} from "@angel-engine/daemon-api/projects";

import os from "node:os";
import path from "node:path";

import { loadProjectLifecycleConfig, PROJECT_CONFIG_FILE } from "./config";
import {
  cancelledLifecycleError,
  cloneLifecycleSnapshot,
  lifecycleFailure,
  lifecycleFailureFrom,
  lifecycleScriptError,
  LOG_TAIL_LENGTH,
  ProjectLifecycleConflictError,
  ProjectLifecycleExecutionError,
  tail,
  throwIfLifecycleCancelled,
} from "./lifecycle-model";
import {
  allocateWorkspacePort,
  type LifecycleProcessAdapter,
  type LifecycleProcessSession,
  SpawnLifecycleProcessAdapter,
} from "./lifecycle-process";
import {
  type LifecycleStorageRecord,
  ProjectLifecycleStorage,
} from "./lifecycle-storage";

export interface ProjectLifecycleExecutionOptions {
  approvedDigest: string;
  baseRef?: string;
  branch?: string;
  killGraceMs?: number;
  onState?: (snapshot: ProjectLifecycleSnapshot) => void;
  port?: number;
  projectId?: string;
  projectRoot: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  worktreePath: string;
}

export interface ProjectLifecycleExecutionResult {
  logTail: string;
  snapshot: ProjectLifecycleSnapshot;
}

export interface ProjectRunStartResult {
  logTail: string;
  snapshot: ProjectLifecycleSnapshot;
}

export interface ProjectLifecycleRuntimeOptions {
  allocatePort?: () => Promise<number>;
  /** Adapter for bounded setup/teardown commands. */
  processAdapter?: LifecycleProcessAdapter;
  /** PTY-capable adapter for the long-running Run session. */
  runProcessAdapter?: LifecycleProcessAdapter;
  storageRoot?: string;
}

interface RunOperation {
  controller: AbortController;
  done: Promise<void>;
  session?: LifecycleProcessSession;
  started: Deferred<ProjectRunStartResult>;
  unlinkSignal: () => void;
}

const SETUP_TIMEOUT_MS = 5 * 60 * 1000;
const TEARDOWN_TIMEOUT_MS = 60 * 1000;
const TERMINATION_GRACE_MS = 1000;

/** Orchestrates lifecycle tracks; process and persistence ownership are injected. */
export class ProjectLifecycleRuntime {
  readonly #activeTracks = new Map<string, Set<ProjectLifecycleKind>>();
  readonly #allocatePort: () => Promise<number>;
  readonly #processAdapter: LifecycleProcessAdapter;
  readonly #runProcessAdapter: LifecycleProcessAdapter;
  readonly #runOperations = new Map<string, RunOperation>();
  readonly #storage: ProjectLifecycleStorage;
  #shuttingDown = false;

  constructor(options: ProjectLifecycleRuntimeOptions = {}) {
    this.#allocatePort = options.allocatePort ?? allocateWorkspacePort;
    this.#processAdapter =
      options.processAdapter ?? new SpawnLifecycleProcessAdapter();
    this.#runProcessAdapter = options.runProcessAdapter ?? this.#processAdapter;
    this.#storage = new ProjectLifecycleStorage({
      root:
        options.storageRoot ??
        path.join(os.homedir(), ".angel-engine", "lifecycle"),
    });
  }

  async execute(
    kind: "setup" | "teardown",
    options: ProjectLifecycleExecutionOptions,
  ): Promise<ProjectLifecycleExecutionResult> {
    const record = await this.#storage.record(options.worktreePath);
    const release = this.#claim(record.worktreePath, kind);
    try {
      const config = await approvedConfig(options);
      const commands =
        kind === "setup" ? config.setupScript : config.teardownScript;
      let logTail = await this.#storage.log(record, kind);

      if (kind === "setup") {
        const context = setupLifecycleContext(options);
        if (context !== undefined) {
          await this.#storage.update(record, options.onState, (snapshot) => {
            snapshot.approvedDigest = config.digest;
            snapshot.setupContext = context;
          });
        }
      }

      for (const [index, command] of commands.entries()) {
        await this.#storage.update(record, options.onState, (snapshot) => {
          snapshot.approvedDigest = config.digest;
          snapshot[kind] = {
            command,
            status: "running",
            step: index + 1,
            stepCount: commands.length,
          };
        });

        try {
          const session = await this.#processAdapter.start({
            cwd: options.worktreePath,
            environment: lifecycleContractEnvironment(kind, options),
            killGraceMs: options.killGraceMs ?? TERMINATION_GRACE_MS,
            onOutput: async (chunk) => {
              logTail = tail(logTail + chunk, LOG_TAIL_LENGTH);
              record.logs[kind] = logTail;
              await this.#storage.appendLog(record, kind, chunk);
            },
            script: command,
            shell: config.scriptShell,
            signal: options.signal,
            timeoutMs:
              options.timeoutMs ??
              (kind === "setup" ? SETUP_TIMEOUT_MS : TEARDOWN_TIMEOUT_MS),
          });
          await session.completion;
        } catch (cause) {
          const failure = lifecycleFailureFrom(cause);
          await this.#storage.update(record, options.onState, (snapshot) => {
            snapshot[kind] = {
              command,
              failure,
              status: "failed",
              step: index + 1,
              stepCount: commands.length,
            };
          });
          throw lifecycleScriptError(kind, command, failure, cause);
        }
      }

      await this.#storage.update(record, options.onState, (snapshot) => {
        snapshot.approvedDigest = config.digest;
        if (kind === "setup") {
          snapshot.setup = {
            completedAt: new Date().toISOString(),
            status: "ready",
          };
        } else {
          snapshot.teardown = {
            completedAt: new Date().toISOString(),
            status: "done",
          };
        }
      });
      return { logTail, snapshot: cloneLifecycleSnapshot(record.snapshot) };
    } finally {
      release();
    }
  }

  async startRun(
    options: ProjectLifecycleExecutionOptions,
  ): Promise<ProjectRunStartResult> {
    const key = path.resolve(options.worktreePath);
    if (this.#shuttingDown) throw cancelledLifecycleError();
    if (this.#runOperations.has(key)) {
      throw new ProjectLifecycleConflictError("run");
    }

    const controller = new AbortController();
    const operation: RunOperation = {
      controller,
      done: Promise.resolve(),
      started: deferred<ProjectRunStartResult>(),
      unlinkSignal: linkAbortSignal(options.signal, controller),
    };
    // Registration is synchronous and precedes record/config/port/storage work,
    // so Stop and Shutdown can always cancel and await a pending startup.
    this.#runOperations.set(key, operation);
    operation.done = this.#run(key, operation, options);
    void operation.done.catch(() => undefined);
    return operation.started.promise;
  }

  async stopRun(worktreePath: string): Promise<ProjectLifecycleSnapshot> {
    const key = path.resolve(worktreePath);
    const operation = this.#runOperations.get(key);
    if (operation !== undefined) {
      operation.controller.abort();
      await operation.done;
    }
    return this.#storage.snapshot(key);
  }

  async shutdown(): Promise<void> {
    this.#shuttingDown = true;
    const operations = [...this.#runOperations.values()];
    for (const operation of operations) operation.controller.abort();
    await Promise.all(operations.map((operation) => operation.done));
  }

  snapshot(worktreePath: string) {
    return this.#storage.snapshot(worktreePath);
  }

  async log(worktreePath: string, kind: ProjectLifecycleKind) {
    return this.#storage.log(await this.#storage.record(worktreePath), kind);
  }

  artifactDirectory(worktreePath: string) {
    return this.#storage.artifactDirectory(worktreePath);
  }

  async #run(
    key: string,
    operation: RunOperation,
    options: ProjectLifecycleExecutionOptions,
  ) {
    let record: LifecycleStorageRecord | undefined;
    let logTail = "";
    try {
      record = await this.#storage.record(key);
      throwIfLifecycleCancelled(operation.controller.signal);
      const config = await approvedConfig(options);
      throwIfLifecycleCancelled(operation.controller.signal);

      if (config.runScript.length === 0) {
        await this.#storage.update(record, options.onState, (snapshot) => {
          snapshot.approvedDigest = config.digest;
          snapshot.run = { status: "stopped" };
        });
        const result = {
          logTail: await this.#storage.log(record, "run"),
          snapshot: cloneLifecycleSnapshot(record.snapshot),
        };
        operation.started.resolve(result);
        return;
      }

      const port = options.port ?? (await this.#allocatePort());
      throwIfLifecycleCancelled(operation.controller.signal);
      await this.#storage.update(record, options.onState, (snapshot) => {
        snapshot.approvedDigest = config.digest;
        snapshot.run = { port, status: "starting" };
      });
      throwIfLifecycleCancelled(operation.controller.signal);
      logTail = await this.#storage.log(record, "run");

      const session = await this.#runProcessAdapter.start({
        cwd: options.worktreePath,
        environment: {
          ...lifecycleContractEnvironment("run", options),
          ANGEL_WORKSPACE_PORT: String(port),
          PORT: String(port),
        },
        killGraceMs: options.killGraceMs ?? TERMINATION_GRACE_MS,
        onOutput: async (chunk) => {
          logTail = tail(logTail + chunk, LOG_TAIL_LENGTH);
          record!.logs.run = logTail;
          await this.#storage.appendLog(record!, "run", chunk);
        },
        script: config.runScript,
        shell: config.scriptShell,
        signal: operation.controller.signal,
        timeoutMs: options.timeoutMs,
      });
      operation.session = session;
      throwIfLifecycleCancelled(operation.controller.signal);
      if (session.pid === undefined) {
        await session.stop();
        throw new ProjectLifecycleExecutionError(
          "Run process did not expose a pid.",
          lifecycleFailure("spawn", "Run process did not expose a pid."),
        );
      }

      await this.#storage.update(record, options.onState, (snapshot) => {
        snapshot.run = { pid: session.pid!, port, status: "running" };
      });
      throwIfLifecycleCancelled(operation.controller.signal);
      operation.started.resolve({
        logTail,
        snapshot: cloneLifecycleSnapshot(record.snapshot),
      });

      const result = await session.completion;
      await this.#storage.update(record, options.onState, (snapshot) => {
        snapshot.run = {
          exitCode: result.exitCode,
          signal: result.signal,
          status: "exited",
        };
      });
    } catch (cause) {
      let reportedCause: unknown = operation.controller.signal.aborted
        ? cancelledLifecycleError()
        : cause;
      if (operation.controller.signal.aborted) {
        try {
          await operation.session?.stop();
          await operation.session?.completion.catch(() => undefined);
        } catch (cleanupCause) {
          reportedCause = new AggregateError(
            [reportedCause, cleanupCause],
            "Run startup cancellation cleanup failed.",
          );
        }
      }
      const structured = lifecycleFailureFrom(reportedCause);
      if (record !== undefined) {
        try {
          await this.#storage.update(record, options.onState, (snapshot) => {
            snapshot.run =
              structured.reason === "cancelled"
                ? { status: "stopped" }
                : { failure: structured, status: "failed" };
          });
        } catch (storageCause) {
          reportedCause = new AggregateError(
            [reportedCause, storageCause],
            "Run failure state could not be persisted.",
          );
        }
      }
      operation.started.reject(reportedCause);
    } finally {
      operation.unlinkSignal();
      if (this.#runOperations.get(key) === operation) {
        this.#runOperations.delete(key);
      }
    }
  }

  #claim(worktreePath: string, kind: "setup" | "teardown") {
    const key = path.resolve(worktreePath);
    const active = this.#activeTracks.get(key) ?? new Set();
    if (active.has(kind)) throw new ProjectLifecycleConflictError(kind);
    active.add(kind);
    this.#activeTracks.set(key, active);
    return () => {
      active.delete(kind);
      if (active.size === 0) this.#activeTracks.delete(key);
    };
  }
}

function setupLifecycleContext(
  options: ProjectLifecycleExecutionOptions,
): ProjectSetupLifecycleContext | undefined {
  if (
    options.baseRef === undefined ||
    options.branch === undefined ||
    options.projectId === undefined
  ) {
    return undefined;
  }
  return {
    baseRef: options.baseRef,
    branch: options.branch,
    projectId: options.projectId,
    projectRoot: options.projectRoot,
  };
}

function lifecycleContractEnvironment(
  kind: ProjectLifecycleKind,
  options: ProjectLifecycleExecutionOptions,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      ANGEL_LIFECYCLE_KIND: kind,
      ANGEL_PROJECT_ID: options.projectId,
      ANGEL_SOURCE_WORKTREE_PATH: options.projectRoot,
      ANGEL_WORKTREE_BASE_REF: options.baseRef,
      ANGEL_WORKTREE_BRANCH: options.branch,
      ANGEL_WORKTREE_PATH: options.worktreePath,
    }).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

async function approvedConfig(options: ProjectLifecycleExecutionOptions) {
  const config = await loadProjectLifecycleConfig(options.projectRoot);
  if (config === undefined) {
    throw new Error(`${PROJECT_CONFIG_FILE} does not exist.`);
  }
  if (config.digest !== options.approvedDigest) {
    throw new Error(
      `${PROJECT_CONFIG_FILE} changed after lifecycle approval; approval is required again.`,
    );
  }
  return config;
}

function linkAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController,
) {
  if (source === undefined) return () => undefined;
  const abort = () => target.abort();
  source.addEventListener("abort", abort, { once: true });
  if (source.aborted) abort();
  return () => source.removeEventListener("abort", abort);
}

interface Deferred<Value> {
  promise: Promise<Value>;
  reject: (cause: unknown) => void;
  resolve: (value: Value) => void;
}

function deferred<Value>(): Deferred<Value> {
  let settled = false;
  let resolvePromise!: (value: Value) => void;
  let rejectPromise!: (cause: unknown) => void;
  const promise = new Promise<Value>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: (cause) => {
      if (settled) return;
      settled = true;
      rejectPromise(cause);
    },
    resolve: (value) => {
      if (settled) return;
      settled = true;
      resolvePromise(value);
    },
  };
}
