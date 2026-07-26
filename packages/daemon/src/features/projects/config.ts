import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const PROJECT_CONFIG_FILE = "2code.json";
const SETUP_ERROR_TAIL_LENGTH = 4096;
const SETUP_SCRIPT_TIMEOUT_MS = 5 * 60 * 1000;
const SETUP_TERMINATION_GRACE_MS = 1000;

export interface ProjectSetupConfig {
  digest: string;
  scripts: string[];
}

export interface ProjectSetupExecutionOptions {
  killGraceMs?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function loadProjectSetupConfig(
  projectRoot: string,
): Promise<ProjectSetupConfig | undefined> {
  const configPath = path.join(projectRoot, PROJECT_CONFIG_FILE);
  let content: string;

  try {
    content = await fs.readFile(configPath, "utf8");
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") return undefined;
    throw new Error(
      `Could not read ${PROJECT_CONFIG_FILE}: ${errorMessage(cause)}`,
      { cause },
    );
  }

  let config: unknown;
  try {
    config = JSON.parse(content) as unknown;
  } catch (cause) {
    throw new Error(
      `Could not parse ${PROJECT_CONFIG_FILE}: ${errorMessage(cause)}`,
      { cause },
    );
  }

  if (!isRecord(config)) {
    throw new Error(`${PROJECT_CONFIG_FILE} must contain a JSON object.`);
  }

  const scripts = config.setup_script;
  if (
    scripts !== undefined &&
    (!Array.isArray(scripts) ||
      !scripts.every((script) => typeof script === "string"))
  ) {
    throw new Error(
      `${PROJECT_CONFIG_FILE} setup_script must be an array of strings.`,
    );
  }

  return {
    digest: createHash("sha256").update(content).digest("hex"),
    scripts: scripts ?? [],
  };
}

export async function executeProjectSetupScripts(
  scripts: string[],
  cwd: string,
  options: ProjectSetupExecutionOptions = {},
) {
  for (const script of scripts) {
    try {
      await executeSetupScript(script, cwd, options);
    } catch (cause) {
      throw new Error(
        `${PROJECT_CONFIG_FILE} setup_script failed (${tail(script)}): ${tail(errorMessage(cause))}`,
        { cause },
      );
    }
  }
}

async function executeSetupScript(
  script: string,
  cwd: string,
  options: ProjectSetupExecutionOptions,
) {
  if (options.signal?.aborted) {
    throw new Error("Setup was cancelled.");
  }

  const [command, args] = scriptCommand(script);
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: setupEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdoutTail = "";
  let stderrTail = "";
  child.stdout?.on("data", (chunk: Buffer | string) => {
    stdoutTail = appendTail(stdoutTail, chunk);
  });
  child.stderr?.on("data", (chunk: Buffer | string) => {
    stderrTail = appendTail(stderrTail, chunk);
  });

  await new Promise<void>((resolve, reject) => {
    let aborted = false;
    let spawnError: Error | undefined;
    let termination: Promise<void> | undefined;
    let timedOut = false;
    const timeoutMs = options.timeoutMs ?? SETUP_SCRIPT_TIMEOUT_MS;
    const killGraceMs = options.killGraceMs ?? SETUP_TERMINATION_GRACE_MS;

    const terminate = () => {
      termination ??= terminateProcessTree(child, killGraceMs);
    };
    const onAbort = () => {
      aborted = true;
      terminate();
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);

    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.once("error", (cause) => {
      spawnError = cause;
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      Promise.resolve(termination).then(() => {
        if (spawnError) {
          reject(spawnError);
        } else if (aborted) {
          reject(new Error("Setup was cancelled."));
        } else if (timedOut) {
          reject(new Error(`Setup timed out after ${timeoutMs}ms.`));
        } else if (code !== 0) {
          reject(
            new Error(
              [
                `Command exited with code ${code ?? "unknown"}`,
                signal ? `signal ${signal}` : "",
                stderrTail || stdoutTail,
              ]
                .filter(Boolean)
                .join(": "),
            ),
          );
        } else {
          resolve();
        }
      }, reject);
    });
  });
}

function setupEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("ANGEL_") && !key.startsWith("ELECTRON_"),
    ),
  );
}

async function terminateProcessTree(child: ChildProcess, graceMs: number) {
  if (child.pid === undefined) return;

  if (process.platform === "win32") {
    await runTaskkill(child.pid);
    return;
  }

  killProcessGroup(child.pid, "SIGTERM");
  await delay(graceMs);
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
    if (errorCode(cause) !== "ESRCH") throw cause;
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function appendTail(current: string, chunk: Buffer | string) {
  return tail(current + chunk.toString());
}

function scriptCommand(script: string): [string, string[]] {
  return process.platform === "win32"
    ? [
        "powershell.exe",
        ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      ]
    : ["sh", ["-c", script]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function tail(value: string) {
  return value.length <= SETUP_ERROR_TAIL_LENGTH
    ? value
    : value.slice(-SETUP_ERROR_TAIL_LENGTH);
}
