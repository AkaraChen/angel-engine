import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const PROJECT_CONFIG_FILE = "2code.json";
const SETUP_ERROR_TAIL_LENGTH = 4096;
const SETUP_SCRIPT_MAX_BUFFER = 1024 * 1024;
const SETUP_SCRIPT_TIMEOUT_MS = 5 * 60 * 1000;

export async function loadProjectSetupScripts(projectRoot: string) {
  const configPath = path.join(projectRoot, PROJECT_CONFIG_FILE);
  let content: string;

  try {
    content = await fs.readFile(configPath, "utf8");
  } catch (cause) {
    if (errorCode(cause) === "ENOENT") return [];
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
  if (scripts === undefined) return [];
  if (
    !Array.isArray(scripts) ||
    !scripts.every((script) => typeof script === "string")
  ) {
    throw new Error(
      `${PROJECT_CONFIG_FILE} setup_script must be an array of strings.`,
    );
  }

  return scripts;
}

export async function executeProjectSetupScripts(
  scripts: string[],
  cwd: string,
) {
  for (const script of scripts) {
    const [command, args] = scriptCommand(script);
    try {
      await execFileAsync(command, args, {
        cwd,
        maxBuffer: SETUP_SCRIPT_MAX_BUFFER,
        timeout: SETUP_SCRIPT_TIMEOUT_MS,
        windowsHide: true,
      });
    } catch (cause) {
      throw new Error(
        `${PROJECT_CONFIG_FILE} setup_script failed (${tail(script)}): ${tail(errorMessage(cause))}`,
        { cause },
      );
    }
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
  if (
    typeof cause === "object" &&
    cause !== null &&
    "stderr" in cause &&
    typeof cause.stderr === "string" &&
    cause.stderr.trim().length > 0
  ) {
    return cause.stderr.trim();
  }
  return cause instanceof Error && cause.message.length > 0
    ? cause.message
    : "Unknown error.";
}

function tail(value: string) {
  return value.length <= SETUP_ERROR_TAIL_LENGTH
    ? value
    : value.slice(-SETUP_ERROR_TAIL_LENGTH);
}
