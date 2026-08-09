import type {
  ProjectLifecycleFailure,
  ProjectLifecycleKind,
  ProjectLifecycleSnapshot,
  ProjectRunLifecycleState,
  ProjectSetupLifecycleState,
  ProjectTeardownLifecycleState,
} from "@angel-engine/daemon-api/projects";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { loadProjectLifecycleConfig, PROJECT_CONFIG_FILE } from "./config";

export type {
  ProjectLifecycleFailure,
  ProjectLifecycleKind,
  ProjectLifecycleSnapshot,
} from "@angel-engine/daemon-api/projects";

export interface ProjectLifecycleExecutionOptions {
  approvedDigest: string;
  killGraceMs?: number;
  onState?: (snapshot: ProjectLifecycleSnapshot) => void;
  port?: number;
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

export class ProjectLifecycleConflictError extends Error {
  readonly kind: ProjectLifecycleKind;

  constructor(kind: ProjectLifecycleKind) {
    super(`A ${kind} lifecycle is already active for this worktree.`);
    this.name = "ProjectLifecycleConflictError";
    this.kind = kind;
  }
}

export class ProjectLifecycleExecutionError extends Error {
  readonly failure: ProjectLifecycleFailure;

  constructor(
    message: string,
    failure: ProjectLifecycleFailure,
    cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "ProjectLifecycleExecutionError";
    this.failure = failure;
  }
}

interface RuntimeRecord {
  activeKinds: Set<ProjectLifecycleKind>;
  logs: Partial<Record<ProjectLifecycleKind, string>>;
  mutationQueue: Promise<void>;
  runHandle?: RunHandle;
  snapshot: ProjectLifecycleSnapshot;
  storageDirectory: string;
  worktreePath: string;
}

interface RunHandle {
  controller: AbortController;
  done: Promise<void>;
  process: LifecycleProcess;
}

interface LifecycleProcess {
  child: ChildProcess;
  completion: Promise<ProcessExit>;
  terminate: () => Promise<void>;
}

interface ProcessExit {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}

interface StartCommandOptions {
  environment?: Record<string, string>;
  killGraceMs: number;
  onChunk: (chunk: string) => Promise<void>;
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface ProjectLifecycleRuntimeOptions {
  storageRoot?: string;
}

const ERROR_TAIL_LENGTH = 4096;
const LOG_TAIL_LENGTH = 1024 * 1024;
const SETUP_TIMEOUT_MS = 5 * 60 * 1000;
const TEARDOWN_TIMEOUT_MS = 60 * 1000;
const TERMINATION_GRACE_MS = 1000;

export class ProjectLifecycleRuntime {
  readonly #recordPromises = new Map<string, Promise<RuntimeRecord>>();
  readonly #storageRoot: string;

  constructor(options: ProjectLifecycleRuntimeOptions = {}) {
    this.#storageRoot = path.resolve(
      options.storageRoot ??
        path.join(os.homedir(), ".angel-engine", "lifecycle"),
    );
  }

  async execute(
    kind: "setup" | "teardown",
    options: ProjectLifecycleExecutionOptions,
  ): Promise<ProjectLifecycleExecutionResult> {
    const record = await this.#record(options.worktreePath);
    this.#claim(record, kind);
    try {
      const config = await approvedConfig(options);
      const commands =
        kind === "setup" ? config.setupScript : config.teardownScript;
      let logTail = await this.#log(record, kind);

      for (const [index, command] of commands.entries()) {
        await this.#update(record, options, (snapshot) => {
          snapshot.approvedDigest = config.digest;
          snapshot[kind] = {
            command,
            status: "running",
            step: index + 1,
            stepCount: commands.length,
          };
        });

        try {
          const process = startCommand(command, options.worktreePath, {
            killGraceMs: options.killGraceMs ?? TERMINATION_GRACE_MS,
            onChunk: async (chunk) => {
              logTail = tail(logTail + chunk, LOG_TAIL_LENGTH);
              record.logs[kind] = logTail;
              await this.#appendLog(record, kind, chunk);
            },
            signal: options.signal,
            timeoutMs:
              options.timeoutMs ??
              (kind === "setup" ? SETUP_TIMEOUT_MS : TEARDOWN_TIMEOUT_MS),
          });
          await process.completion;
        } catch (cause) {
          const failure = failureFrom(cause);
          await this.#update(record, options, (snapshot) => {
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

      await this.#update(record, options, (snapshot) => {
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
      return { logTail, snapshot: cloneSnapshot(record.snapshot) };
    } finally {
      record.activeKinds.delete(kind);
    }
  }

  async startRun(
    options: ProjectLifecycleExecutionOptions,
  ): Promise<ProjectRunStartResult> {
    const record = await this.#record(options.worktreePath);
    this.#claim(record, "run");
    let startedProcess: LifecycleProcess | undefined;
    try {
      const config = await approvedConfig(options);
      if (config.runScript.length === 0) {
        await this.#update(record, options, (snapshot) => {
          snapshot.approvedDigest = config.digest;
          snapshot.run = { status: "stopped" };
        });
        record.activeKinds.delete("run");
        return {
          logTail: await this.#log(record, "run"),
          snapshot: cloneSnapshot(record.snapshot),
        };
      }

      const port = options.port ?? (await allocateWorkspacePort());
      await this.#update(record, options, (snapshot) => {
        snapshot.approvedDigest = config.digest;
        snapshot.run = { port, status: "starting" };
      });

      let logTail = await this.#log(record, "run");
      const controller = new AbortController();
      const unlinkSignal = linkAbortSignal(options.signal, controller);
      const process = startCommand(config.runScript, options.worktreePath, {
        environment: {
          ANGEL_WORKSPACE_PORT: String(port),
          PORT: String(port),
        },
        killGraceMs: options.killGraceMs ?? TERMINATION_GRACE_MS,
        onChunk: async (chunk) => {
          logTail = tail(logTail + chunk, LOG_TAIL_LENGTH);
          record.logs.run = logTail;
          await this.#appendLog(record, "run", chunk);
        },
        signal: controller.signal,
        timeoutMs: options.timeoutMs,
      });
      startedProcess = process;

      if (process.child.pid === undefined) {
        await process.terminate();
        throw new ProjectLifecycleExecutionError(
          "Run process did not expose a pid.",
          failure("spawn", "Run process did not expose a pid."),
        );
      }

      await this.#update(record, options, (snapshot) => {
        snapshot.run = { pid: process.child.pid!, port, status: "running" };
      });

      const handle: RunHandle = {
        controller,
        done: Promise.resolve(),
        process,
      };
      record.runHandle = handle;
      handle.done = this.#observeRun(record, options, handle, unlinkSignal);
      return { logTail, snapshot: cloneSnapshot(record.snapshot) };
    } catch (cause) {
      if (record.runHandle === undefined) {
        await startedProcess?.terminate();
        await startedProcess?.completion.catch(() => undefined);
        record.activeKinds.delete("run");
      }
      throw cause;
    }
  }

  async stopRun(worktreePath: string): Promise<ProjectLifecycleSnapshot> {
    const record = await this.#record(worktreePath);
    const handle = record.runHandle;
    if (handle === undefined) return cloneSnapshot(record.snapshot);
    handle.controller.abort();
    await handle.done;
    return cloneSnapshot(record.snapshot);
  }

  async shutdown(): Promise<void> {
    const records = await Promise.all(this.#recordPromises.values());
    await Promise.all(
      records.map(async (record) => {
        const handle = record.runHandle;
        if (handle === undefined) return;
        handle.controller.abort();
        await handle.done;
      }),
    );
  }

  async snapshot(worktreePath: string): Promise<ProjectLifecycleSnapshot> {
    const record = await this.#record(worktreePath);
    await record.mutationQueue;
    return cloneSnapshot(record.snapshot);
  }

  async log(worktreePath: string, kind: ProjectLifecycleKind): Promise<string> {
    return this.#log(await this.#record(worktreePath), kind);
  }

  artifactDirectory(worktreePath: string): string {
    return path.join(
      this.#storageRoot,
      createHash("sha256").update(path.resolve(worktreePath)).digest("hex"),
    );
  }

  async #observeRun(
    record: RuntimeRecord,
    options: ProjectLifecycleExecutionOptions,
    handle: RunHandle,
    unlinkSignal: () => void,
  ) {
    try {
      const result = await handle.process.completion;
      await this.#update(record, options, (snapshot) => {
        snapshot.run = {
          exitCode: result.exitCode,
          signal: result.signal,
          status: "exited",
        };
      });
    } catch (cause) {
      const structured = failureFrom(cause);
      await this.#update(record, options, (snapshot) => {
        snapshot.run =
          structured.reason === "cancelled"
            ? { status: "stopped" }
            : { failure: structured, status: "failed" };
      });
    } finally {
      unlinkSignal();
      if (record.runHandle === handle) record.runHandle = undefined;
      record.activeKinds.delete("run");
    }
  }

  #claim(record: RuntimeRecord, kind: ProjectLifecycleKind) {
    if (record.activeKinds.has(kind)) {
      throw new ProjectLifecycleConflictError(kind);
    }
    record.activeKinds.add(kind);
  }

  #record(worktreePath: string): Promise<RuntimeRecord> {
    const key = path.resolve(worktreePath);
    const existing = this.#recordPromises.get(key);
    if (existing !== undefined) return existing;
    const created = this.#loadRecord(key);
    this.#recordPromises.set(key, created);
    void created.catch(() => this.#recordPromises.delete(key));
    return created;
  }

  async #loadRecord(worktreePath: string): Promise<RuntimeRecord> {
    const storageDirectory = this.artifactDirectory(worktreePath);
    await secureDirectory(this.#storageRoot);
    await secureDirectory(storageDirectory);
    const snapshot = await readSnapshot(storageDirectory);
    const recovered = recoverInterruptedState(snapshot);
    const record: RuntimeRecord = {
      activeKinds: new Set(),
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

  #update(
    record: RuntimeRecord,
    options: Pick<ProjectLifecycleExecutionOptions, "onState">,
    mutate: (snapshot: ProjectLifecycleSnapshot) => void,
  ): Promise<ProjectLifecycleSnapshot> {
    const operation = record.mutationQueue.then(async () => {
      const next = cloneSnapshot(record.snapshot);
      mutate(next);
      next.updatedAt = new Date().toISOString();
      await writeSnapshot(record.storageDirectory, next);
      record.snapshot = next;
      options.onState?.(cloneSnapshot(next));
      return cloneSnapshot(next);
    });
    record.mutationQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #log(record: RuntimeRecord, kind: ProjectLifecycleKind) {
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

  async #appendLog(
    record: RuntimeRecord,
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
}

const defaultRuntime = new ProjectLifecycleRuntime();

export function executeProjectLifecycle(
  kind: "setup" | "teardown",
  options: ProjectLifecycleExecutionOptions,
) {
  return defaultRuntime.execute(kind, options);
}

export function startProjectRun(options: ProjectLifecycleExecutionOptions) {
  return defaultRuntime.startRun(options);
}

export function stopProjectRun(worktreePath: string) {
  return defaultRuntime.stopRun(worktreePath);
}

export function shutdownProjectRuns() {
  return defaultRuntime.shutdown();
}

export function readProjectLifecycleSnapshot(worktreePath: string) {
  return defaultRuntime.snapshot(worktreePath);
}

export function readProjectLifecycleLog(
  worktreePath: string,
  kind: ProjectLifecycleKind,
) {
  return defaultRuntime.log(worktreePath, kind);
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

function startCommand(
  script: string,
  cwd: string,
  options: StartCommandOptions,
): LifecycleProcess {
  if (options.signal?.aborted) {
    throw new ProjectLifecycleExecutionError(
      "Lifecycle was cancelled.",
      failure("cancelled", "Lifecycle was cancelled."),
    );
  }

  const [command, args] = scriptCommand(script);
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: lifecycleEnvironment(options.environment),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let outputTail = "";
  let writeQueue = Promise.resolve();
  const capture = (chunk: Buffer | string) => {
    const value = chunk.toString();
    outputTail = tail(outputTail + value, ERROR_TAIL_LENGTH);
    writeQueue = writeQueue.then(() => options.onChunk(value));
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  let cancellationRequested = false;
  let timeoutRequested = false;
  let termination: Promise<void> | undefined;
  const terminate = () => {
    termination ??= terminateProcessTree(child, options.killGraceMs);
    return termination;
  };
  const onAbort = () => {
    cancellationRequested = true;
    void terminate();
  };
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout =
    options.timeoutMs === undefined
      ? undefined
      : setTimeout(() => {
          timeoutRequested = true;
          void terminate();
        }, options.timeoutMs);

  const completion = new Promise<ProcessExit>((resolve, reject) => {
    let spawnError: Error | undefined;
    child.once("error", (cause) => {
      spawnError = cause;
    });
    child.once("close", (exitCode, signal) => {
      if (timeout !== undefined) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      Promise.resolve(termination)
        .then(() => writeQueue)
        .then(() => {
          if (spawnError !== undefined) {
            reject(
              new ProjectLifecycleExecutionError(
                spawnError.message,
                failure("spawn", spawnError.message),
                spawnError,
              ),
            );
          } else if (cancellationRequested) {
            reject(
              new ProjectLifecycleExecutionError(
                "Lifecycle was cancelled.",
                failure(
                  "cancelled",
                  "Lifecycle was cancelled.",
                  exitCode,
                  signal,
                ),
              ),
            );
          } else if (timeoutRequested) {
            const message = `Lifecycle timed out after ${options.timeoutMs}ms.`;
            reject(
              new ProjectLifecycleExecutionError(
                message,
                failure("timeout", message, exitCode, signal),
              ),
            );
          } else if (signal !== null) {
            const message = `Command exited from signal ${signal}.`;
            reject(
              new ProjectLifecycleExecutionError(
                message,
                failure("signal", message, exitCode, signal),
              ),
            );
          } else if (exitCode !== 0) {
            const message = [
              `Command exited with code ${exitCode ?? "unknown"}.`,
              outputTail,
            ]
              .filter(Boolean)
              .join(" ");
            reject(
              new ProjectLifecycleExecutionError(
                message,
                failure("exit", message, exitCode, null),
              ),
            );
          } else {
            resolve({ exitCode, signal });
          }
        }, reject);
    });
  });
  void completion.catch(() => undefined);
  return { child, completion, terminate };
}

export function lifecycleEnvironment(
  injected: Record<string, string> = {},
): NodeJS.ProcessEnv {
  return {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => !key.startsWith("ANGEL_") && !key.startsWith("ELECTRON_"),
      ),
    ),
    ...injected,
  };
}

export async function allocateWorkspacePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        server.close();
        reject(new Error("Could not allocate a workspace port."));
        return;
      }
      server.close((cause) => {
        if (cause) reject(cause);
        else resolve(address.port);
      });
    });
  });
}

export async function terminateProcessTree(
  child: ChildProcess,
  graceMs: number,
) {
  if (child.pid === undefined) return;
  if (process.platform === "win32") {
    await runTaskkill(child.pid);
    return;
  }
  killProcessGroup(child.pid, "SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, graceMs));
  killProcessGroup(child.pid, "SIGKILL");
}

async function readSnapshot(storageDirectory: string) {
  const statePath = path.join(storageDirectory, "lifecycle.json");
  try {
    await rejectSymlink(statePath);
    const parsed = JSON.parse(await fs.readFile(statePath, "utf8")) as unknown;
    if (isLifecycleSnapshot(parsed)) return parsed;
    await quarantineCorruptState(statePath);
    return initialSnapshot();
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") return initialSnapshot();
    if (cause instanceof SyntaxError) {
      await quarantineCorruptState(statePath);
      return initialSnapshot();
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

function recoverInterruptedState(
  snapshot: ProjectLifecycleSnapshot,
): ProjectLifecycleSnapshot {
  const recovered = cloneSnapshot(snapshot);
  const restartFailure = failure(
    "daemon_restart",
    "Daemon stopped while the lifecycle was active.",
  );
  if (recovered.setup.status === "running") {
    recovered.setup = {
      ...recovered.setup,
      failure: restartFailure,
      status: "failed",
    };
  }
  if (
    recovered.run.status === "running" ||
    recovered.run.status === "starting"
  ) {
    recovered.run = { failure: restartFailure, status: "failed" };
  }
  if (recovered.teardown.status === "running") {
    recovered.teardown = {
      ...recovered.teardown,
      failure: restartFailure,
      status: "failed",
    };
  }
  return recovered;
}

function initialSnapshot(): ProjectLifecycleSnapshot {
  return {
    run: { status: "stopped" },
    setup: { status: "idle" },
    teardown: { status: "idle" },
    updatedAt: new Date().toISOString(),
    version: 1,
  };
}

function isLifecycleSnapshot(
  value: unknown,
): value is ProjectLifecycleSnapshot {
  if (!isRecord(value) || value.version !== 1 || !isIsoDate(value.updatedAt)) {
    return false;
  }
  if (
    value.approvedDigest !== undefined &&
    typeof value.approvedDigest !== "string"
  ) {
    return false;
  }
  return (
    isSetupState(value.setup) &&
    isRunState(value.run) &&
    isTeardownState(value.teardown)
  );
}

function isSetupState(value: unknown): value is ProjectSetupLifecycleState {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "idle") return true;
  if (value.status === "ready") return isIsoDate(value.completedAt);
  return (
    isStepState(value) &&
    (value.status === "running" ||
      (value.status === "failed" && isFailure(value.failure)))
  );
}

function isTeardownState(
  value: unknown,
): value is ProjectTeardownLifecycleState {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "idle") return true;
  if (value.status === "done") return isIsoDate(value.completedAt);
  return (
    isStepState(value) &&
    (value.status === "running" ||
      (value.status === "failed" && isFailure(value.failure)))
  );
}

function isRunState(value: unknown): value is ProjectRunLifecycleState {
  if (!isRecord(value) || typeof value.status !== "string") return false;
  if (value.status === "stopped") return true;
  if (value.status === "starting") return isPort(value.port);
  if (value.status === "running") {
    return (
      isPort(value.port) &&
      Number.isInteger(value.pid) &&
      Number(value.pid) > 0 &&
      (value.url === undefined || typeof value.url === "string")
    );
  }
  if (value.status === "exited") {
    return isNullableInteger(value.exitCode) && isNullableString(value.signal);
  }
  return value.status === "failed" && isFailure(value.failure);
}

function isStepState(value: Record<string, unknown>) {
  return (
    typeof value.command === "string" &&
    Number.isInteger(value.step) &&
    Number.isInteger(value.stepCount) &&
    Number(value.step) > 0 &&
    Number(value.stepCount) >= Number(value.step)
  );
}

function isFailure(value: unknown): value is ProjectLifecycleFailure {
  if (!isRecord(value)) return false;
  return (
    [
      "cancelled",
      "daemon_restart",
      "exit",
      "signal",
      "spawn",
      "timeout",
    ].includes(String(value.reason)) &&
    typeof value.message === "string" &&
    isNullableInteger(value.exitCode) &&
    isNullableString(value.signal)
  );
}

function failure(
  reason: ProjectLifecycleFailure["reason"],
  message: string,
  exitCode: number | null = null,
  signal: NodeJS.Signals | null = null,
): ProjectLifecycleFailure {
  return { exitCode, message, reason, signal };
}

function failureFrom(cause: unknown): ProjectLifecycleFailure {
  return cause instanceof ProjectLifecycleExecutionError
    ? cause.failure
    : failure("spawn", errorMessage(cause));
}

function lifecycleScriptError(
  kind: "setup" | "teardown",
  command: string,
  structured: ProjectLifecycleFailure,
  cause: unknown,
) {
  return new ProjectLifecycleExecutionError(
    `${PROJECT_CONFIG_FILE} ${kind}_script failed (${tail(command, ERROR_TAIL_LENGTH)}): ${tail(structured.message, ERROR_TAIL_LENGTH)}`,
    structured,
    cause,
  );
}

function linkAbortSignal(
  source: AbortSignal | undefined,
  target: AbortController,
) {
  if (source === undefined) return () => undefined;
  const abort = () => target.abort();
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

async function runTaskkill(pid: number) {
  await new Promise<void>((resolve) => {
    const killer = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    killer.once("error", () => resolve());
    killer.once("close", () => resolve());
  });
}

function killProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal);
  } catch (cause) {
    const code = errorCode(cause);
    if (code !== "EPERM" && code !== "ESRCH") throw cause;
  }
}

function scriptCommand(script: string): [string, string[]] {
  return process.platform === "win32"
    ? [
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      ]
    : ["sh", ["-c", script]];
}

function cloneSnapshot(snapshot: ProjectLifecycleSnapshot) {
  return structuredClone(snapshot);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDate(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNullableInteger(value: unknown) {
  return value === null || Number.isInteger(value);
}

function isNullableString(value: unknown) {
  return value === null || typeof value === "string";
}

function isPort(value: unknown) {
  return (
    Number.isInteger(value) && Number(value) > 0 && Number(value) <= 65_535
  );
}

function errorCode(cause: unknown) {
  if (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof cause.code === "string"
  ) {
    return cause.code;
  }
  return undefined;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error && cause.message.length > 0
    ? cause.message
    : "Unknown error.";
}

function tail(value: string, length: number) {
  return value.length <= length ? value : value.slice(-length);
}
