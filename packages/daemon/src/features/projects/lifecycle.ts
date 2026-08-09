import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";

import { loadProjectLifecycleConfig, PROJECT_CONFIG_FILE } from "./config";

export type ProjectLifecycleKind = "run" | "setup" | "teardown";

export type SetupLifecycleState =
  | { status: "idle" }
  | { command: string; step: number; stepCount: number; status: "running" }
  | {
      command: string;
      error: string;
      step: number;
      stepCount: number;
      status: "failed";
    }
  | { completedAt: string; status: "ready" };

export type RunLifecycleState =
  | { status: "stopped" }
  | { port: number; status: "starting" }
  | { pid: number; port: number; status: "running"; url?: string }
  | { code: number | null; signal: NodeJS.Signals | null; status: "exited" }
  | { error: string; status: "failed" };

export type TeardownLifecycleState =
  | { status: "idle" }
  | { command: string; step: number; stepCount: number; status: "running" }
  | {
      command: string;
      error: string;
      step: number;
      stepCount: number;
      status: "failed";
    }
  | { completedAt: string; status: "done" };

export interface ProjectLifecycleSnapshot {
  approvedDigest?: string;
  run: RunLifecycleState;
  setup: SetupLifecycleState;
  teardown: TeardownLifecycleState;
  updatedAt: string;
  version: 1;
}

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

const ERROR_TAIL_LENGTH = 4096;
const LOG_TAIL_LENGTH = 1024 * 1024;
const SETUP_TIMEOUT_MS = 5 * 60 * 1000;
const TEARDOWN_TIMEOUT_MS = 60 * 1000;
const TERMINATION_GRACE_MS = 1000;
const runtimeByWorktree = new Map<
  string,
  {
    logs: Partial<Record<ProjectLifecycleKind, string>>;
    snapshot: ProjectLifecycleSnapshot;
  }
>();

export async function executeProjectLifecycle(
  kind: ProjectLifecycleKind,
  options: ProjectLifecycleExecutionOptions,
): Promise<ProjectLifecycleExecutionResult> {
  const config = await loadProjectLifecycleConfig(options.projectRoot);
  if (config === undefined) {
    throw new Error(`${PROJECT_CONFIG_FILE} does not exist.`);
  }
  if (config.digest !== options.approvedDigest) {
    throw new Error(
      `${PROJECT_CONFIG_FILE} changed after lifecycle approval; approval is required again.`,
    );
  }

  const commands =
    kind === "setup"
      ? config.setupScript
      : kind === "teardown"
        ? config.teardownScript
        : config.runScript.length > 0
          ? [config.runScript]
          : [];
  const runtime = await loadRuntime(options.worktreePath);
  runtime.snapshot.approvedDigest = config.digest;
  let logTail = runtime.logs[kind] ?? "";
  const port =
    kind === "run"
      ? (options.port ?? (await allocateWorkspacePort()))
      : undefined;

  if (kind === "run" && port !== undefined) {
    await updateState(runtime, options, { port, status: "starting" }, kind);
  }

  for (const [index, command] of commands.entries()) {
    await updateState(
      runtime,
      options,
      runningState(kind, command, index + 1, commands.length, port),
      kind,
    );
    try {
      const result = await executeCommand(command, options.worktreePath, {
        ...options,
        kind,
        onChunk: async (chunk) => {
          logTail = tail(logTail + chunk, LOG_TAIL_LENGTH);
          runtime.logs[kind] = logTail;
          await appendLifecycleLog(options.worktreePath, kind, chunk);
        },
        onSpawn: async (pid) => {
          if (kind !== "run" || port === undefined) return;
          await updateState(
            runtime,
            options,
            { pid, port, status: "running" },
            kind,
          );
        },
        port,
      });
      if (kind === "run") {
        await updateState(
          runtime,
          options,
          { code: result.code, signal: result.signal, status: "exited" },
          kind,
        );
      }
    } catch (cause) {
      const message = errorMessage(cause);
      await updateState(
        runtime,
        options,
        failedState(kind, command, index + 1, commands.length, message),
        kind,
      );
      throw new Error(
        `${PROJECT_CONFIG_FILE} ${kind}_script failed (${tail(command, ERROR_TAIL_LENGTH)}): ${tail(message, ERROR_TAIL_LENGTH)}`,
        { cause },
      );
    }
  }

  if (kind === "setup") {
    await updateState(
      runtime,
      options,
      { completedAt: new Date().toISOString(), status: "ready" },
      kind,
    );
  } else if (kind === "teardown") {
    await updateState(
      runtime,
      options,
      { completedAt: new Date().toISOString(), status: "done" },
      kind,
    );
  } else if (commands.length === 0) {
    await updateState(runtime, options, { status: "stopped" }, kind);
  }

  return { logTail, snapshot: structuredClone(runtime.snapshot) };
}

export async function readProjectLifecycleSnapshot(
  worktreePath: string,
): Promise<ProjectLifecycleSnapshot> {
  return structuredClone((await loadRuntime(worktreePath)).snapshot);
}

export async function readProjectLifecycleLog(
  worktreePath: string,
  kind: ProjectLifecycleKind,
): Promise<string> {
  const runtime = await loadRuntime(worktreePath);
  const cached = runtime.logs[kind];
  if (cached !== undefined) return cached;
  try {
    const log = tail(
      await fs.readFile(lifecycleLogPath(worktreePath, kind), "utf8"),
      LOG_TAIL_LENGTH,
    );
    runtime.logs[kind] = log;
    return log;
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") return "";
    throw cause;
  }
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

interface CommandExecutionOptions extends ProjectLifecycleExecutionOptions {
  kind: ProjectLifecycleKind;
  onChunk: (chunk: string) => Promise<void>;
  onSpawn: (pid: number) => Promise<void>;
  port?: number;
}

async function executeCommand(
  script: string,
  cwd: string,
  options: CommandExecutionOptions,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (options.signal?.aborted)
    throw new Error(`${title(options.kind)} was cancelled.`);

  const [command, args] = scriptCommand(script);
  const injected: Record<string, string> =
    options.kind === "run" && options.port !== undefined
      ? {
          ANGEL_WORKSPACE_PORT: String(options.port),
          PORT: String(options.port),
        }
      : {};
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: lifecycleEnvironment(injected),
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
  const completion = waitForChild(child, options, outputTailValue);
  // State persistence can outlive a very short command. Attach a rejection
  // handler immediately, then still await the original promise below.
  void completion.catch(() => undefined);

  if (child.pid !== undefined) {
    try {
      await options.onSpawn(child.pid);
    } catch (cause) {
      await terminateProcessTree(
        child,
        options.killGraceMs ?? TERMINATION_GRACE_MS,
      );
      await completion.catch(() => undefined);
      throw cause;
    }
  }

  try {
    return await completion;
  } finally {
    await writeQueue;
  }

  function outputTailValue() {
    return outputTail;
  }
}

async function waitForChild(
  child: ChildProcess,
  options: CommandExecutionOptions,
  outputTail: () => string,
) {
  return new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
      let aborted = false;
      let spawnError: Error | undefined;
      let termination: Promise<void> | undefined;
      let timedOut = false;
      const timeoutMs =
        options.timeoutMs ??
        (options.kind === "setup"
          ? SETUP_TIMEOUT_MS
          : options.kind === "teardown"
            ? TEARDOWN_TIMEOUT_MS
            : undefined);
      const terminate = () => {
        termination ??= terminateProcessTree(
          child,
          options.killGraceMs ?? TERMINATION_GRACE_MS,
        );
      };
      const onAbort = () => {
        aborted = true;
        terminate();
      };
      const timeout =
        timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              timedOut = true;
              terminate();
            }, timeoutMs);

      options.signal?.addEventListener("abort", onAbort, { once: true });
      child.once("error", (cause) => {
        spawnError = cause;
      });
      child.once("close", (code, signal) => {
        if (timeout !== undefined) clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
        Promise.resolve(termination).then(() => {
          if (spawnError) reject(spawnError);
          else if (aborted)
            reject(new Error(`${title(options.kind)} was cancelled.`));
          else if (timedOut)
            reject(
              new Error(
                `${title(options.kind)} timed out after ${timeoutMs}ms.`,
              ),
            );
          else if (code !== 0)
            reject(
              new Error(
                [
                  `Command exited with code ${code ?? "unknown"}`,
                  signal ? `signal ${signal}` : "",
                  outputTail(),
                ]
                  .filter(Boolean)
                  .join(": "),
              ),
            );
          else resolve({ code, signal });
        }, reject);
      });
    },
  );
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

async function updateState(
  runtime: Awaited<ReturnType<typeof loadRuntime>>,
  options: ProjectLifecycleExecutionOptions,
  state: RunLifecycleState | SetupLifecycleState | TeardownLifecycleState,
  kind: ProjectLifecycleKind,
) {
  Object.assign(runtime.snapshot, {
    [kind]: state,
    updatedAt: new Date().toISOString(),
  });
  await persistSnapshot(options.worktreePath, runtime.snapshot);
  options.onState?.(structuredClone(runtime.snapshot));
}

async function loadRuntime(worktreePath: string) {
  const key = path.resolve(worktreePath);
  const cached = runtimeByWorktree.get(key);
  if (cached !== undefined) return cached;

  let snapshot = initialSnapshot();
  try {
    const persisted = JSON.parse(
      await fs.readFile(lifecycleStatePath(key), "utf8"),
    ) as ProjectLifecycleSnapshot;
    snapshot = recoverInterruptedState(persisted);
    if (JSON.stringify(snapshot) !== JSON.stringify(persisted)) {
      snapshot.updatedAt = new Date().toISOString();
      await persistSnapshot(key, snapshot);
    }
  } catch (cause) {
    if (errorCode(cause) !== "ENOENT") throw cause;
  }
  const runtime: {
    logs: Partial<Record<ProjectLifecycleKind, string>>;
    snapshot: ProjectLifecycleSnapshot;
  } = { logs: {}, snapshot };
  runtimeByWorktree.set(key, runtime);
  return runtime;
}

function recoverInterruptedState(
  snapshot: ProjectLifecycleSnapshot,
): ProjectLifecycleSnapshot {
  const recovered = structuredClone(snapshot);
  if (recovered.setup.status === "running") {
    recovered.setup = {
      ...recovered.setup,
      error: "Daemon stopped during setup.",
      status: "failed",
    };
  }
  if (
    recovered.run.status === "running" ||
    recovered.run.status === "starting"
  ) {
    recovered.run = {
      error: "Daemon stopped while run was active.",
      status: "failed",
    };
  }
  if (recovered.teardown.status === "running") {
    recovered.teardown = {
      ...recovered.teardown,
      error: "Daemon stopped during teardown.",
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

async function persistSnapshot(
  worktreePath: string,
  snapshot: ProjectLifecycleSnapshot,
) {
  const statePath = lifecycleStatePath(worktreePath);
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  const temporaryPath = `${statePath}.tmp`;
  await fs.writeFile(
    temporaryPath,
    `${JSON.stringify(snapshot, null, 2)}\n`,
    "utf8",
  );
  await fs.rename(temporaryPath, statePath);
}

async function appendLifecycleLog(
  worktreePath: string,
  kind: ProjectLifecycleKind,
  chunk: string,
) {
  const logPath = lifecycleLogPath(worktreePath, kind);
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.appendFile(logPath, chunk, "utf8");
}

function lifecycleStatePath(worktreePath: string) {
  return path.join(worktreePath, ".angel", "lifecycle.json");
}

function lifecycleLogPath(worktreePath: string, kind: ProjectLifecycleKind) {
  return path.join(worktreePath, ".angel", "logs", `${kind}.log`);
}

function runningState(
  kind: ProjectLifecycleKind,
  command: string,
  step: number,
  stepCount: number,
  port?: number,
): RunLifecycleState | SetupLifecycleState | TeardownLifecycleState {
  if (kind === "run") return { port: port ?? 0, status: "starting" };
  return { command, status: "running", step, stepCount };
}

function failedState(
  kind: ProjectLifecycleKind,
  command: string,
  step: number,
  stepCount: number,
  error: string,
): RunLifecycleState | SetupLifecycleState | TeardownLifecycleState {
  if (kind === "run") {
    return error.endsWith("was cancelled.")
      ? { status: "stopped" }
      : { error, status: "failed" };
  }
  return { command, error, status: "failed", step, stepCount };
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

function title(kind: ProjectLifecycleKind) {
  return `${kind[0]?.toUpperCase()}${kind.slice(1)}`;
}
