import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";

import {
  ERROR_TAIL_LENGTH,
  lifecycleFailure,
  ProjectLifecycleExecutionError,
  tail,
} from "./lifecycle-model";

export interface LifecycleProcessExit {
  exitCode: number | null;
  signal: string | null;
}

/**
 * Runtime-owned view of a process session. A PTY implementation may expose the
 * same object as an InteractiveLifecycleProcessSession to its terminal API;
 * lifecycle orchestration must never spawn or own a second process for it.
 */
export interface LifecycleProcessSession {
  completion: Promise<LifecycleProcessExit>;
  pid: number | undefined;
  stop: () => Promise<void>;
}

/** Optional interaction surface retained by PTY-backed adapters for L3. */
export interface InteractiveLifecycleProcessSession
  extends LifecycleProcessSession {
  resize: (columns: number, rows: number) => void;
  write: (data: string) => void;
}

export interface LifecycleProcessStartOptions {
  cwd: string;
  environment?: Record<string, string>;
  killGraceMs: number;
  onOutput: (chunk: string) => Promise<void>;
  script: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Adapter boundary implemented by pipe processes today and PTY sessions in L3.
 * Implementations own exactly one session, forward its raw output (including
 * ANSI), and must observe an already-aborted signal as well as future aborts.
 */
export interface LifecycleProcessAdapter {
  start: (
    options: LifecycleProcessStartOptions,
  ) => Promise<LifecycleProcessSession>;
}

export class SpawnLifecycleProcessAdapter implements LifecycleProcessAdapter {
  async start(
    options: LifecycleProcessStartOptions,
  ): Promise<LifecycleProcessSession> {
    const [command, args] = scriptCommand(options.script);
    const child = spawn(command, args, {
      cwd: options.cwd,
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
      writeQueue = writeQueue.then(() => options.onOutput(value));
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);

    let cancellationRequested = false;
    let timeoutRequested = false;
    let termination: Promise<void> | undefined;
    let timeout: NodeJS.Timeout | undefined;
    const terminate = () => {
      termination ??= terminateProcessTree(child, options.killGraceMs);
      return termination;
    };
    const onAbort = () => {
      cancellationRequested = true;
      void terminate();
    };

    const completion = new Promise<LifecycleProcessExit>((resolve, reject) => {
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
                  lifecycleFailure("spawn", spawnError.message),
                  spawnError,
                ),
              );
            } else if (cancellationRequested) {
              reject(
                new ProjectLifecycleExecutionError(
                  "Lifecycle was cancelled.",
                  lifecycleFailure(
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
                  lifecycleFailure("timeout", message, exitCode, signal),
                ),
              );
            } else if (signal !== null) {
              const message = `Command exited from signal ${signal}.`;
              reject(
                new ProjectLifecycleExecutionError(
                  message,
                  lifecycleFailure("signal", message, exitCode, signal),
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
                  lifecycleFailure("exit", message, exitCode, null),
                ),
              );
            } else {
              resolve({ exitCode, signal });
            }
          }, reject);
      });
    });
    void completion.catch(() => undefined);

    // Subscribe before inspecting aborted so an abort cannot land between the
    // check and listener registration. The already-aborted case is collected
    // through the same process-tree termination path.
    options.signal?.addEventListener("abort", onAbort, { once: true });
    if (options.signal?.aborted) onAbort();
    timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timeoutRequested = true;
            void terminate();
          }, options.timeoutMs);

    return {
      completion,
      pid: child.pid,
      stop: async () => {
        cancellationRequested = true;
        await terminate();
        await completion.catch(() => undefined);
      },
    };
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
