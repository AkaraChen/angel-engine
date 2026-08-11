import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { ProjectScriptShell } from "@angel-engine/daemon-api/projects";

export const PROJECT_CONFIG_FILE = "2code.json";

export interface ProjectLifecycleConfig {
  digest: string;
  legacyInitScript: string[];
  runScript: string;
  scriptShell: ProjectScriptShell;
  setupScript: string[];
  teardownScript: string[];
}

export function projectConfigPath(projectRoot: string) {
  return path.join(projectRoot, PROJECT_CONFIG_FILE);
}

export async function loadProjectLifecycleConfig(
  projectRoot: string,
): Promise<ProjectLifecycleConfig | undefined> {
  const file = await readProjectConfigFile(projectRoot);
  if (file === undefined) return undefined;

  return {
    digest: createHash("sha256").update(file.content).digest("hex"),
    legacyInitScript: readCommandList(file.config, "init_script"),
    runScript: readRunScript(file.config),
    scriptShell: readScriptShell(file.config),
    setupScript: readCommandList(file.config, "setup_script"),
    teardownScript: readCommandList(file.config, "teardown_script"),
  };
}

/**
 * Replaces the modeled lifecycle keys and leaves every other key untouched.
 * Blank commands are dropped rather than persisted as no-op steps.
 */
export async function saveProjectLifecycleConfig(
  projectRoot: string,
  input: {
    runScript: string;
    scriptShell?: ProjectScriptShell;
    setupScript: string[];
    teardownScript: string[];
  },
): Promise<Omit<ProjectLifecycleConfig, "digest">> {
  // Read first: a file we cannot parse must fail loudly instead of being
  // silently replaced with a fresh one.
  const file = await readProjectConfigFile(projectRoot);
  if (file !== undefined) validateLifecycleConfig(file.config);

  const setupScript = normalizeCommands(input.setupScript);
  const teardownScript = normalizeCommands(input.teardownScript);
  const runScript = input.runScript.trim();
  const scriptShell = input.scriptShell ?? "auto";
  const { init_script: _legacyInitScript, ...preservedConfig } =
    file?.config ?? {};
  const config = {
    ...preservedConfig,
    run_script: runScript,
    script_shell: scriptShell,
    setup_script: setupScript,
    teardown_script: teardownScript,
  };

  await fs.writeFile(
    projectConfigPath(projectRoot),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8",
  );

  return {
    legacyInitScript: [],
    runScript,
    scriptShell,
    setupScript,
    teardownScript,
  };
}

async function readProjectConfigFile(projectRoot: string) {
  let content: string;

  try {
    content = await fs.readFile(projectConfigPath(projectRoot), "utf8");
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

  return { config, content };
}

function readCommandList(
  config: Record<string, unknown>,
  key: "init_script" | "setup_script" | "teardown_script",
): string[] {
  const scripts = config[key];
  if (scripts === undefined) return [];
  if (
    !Array.isArray(scripts) ||
    !scripts.every((script) => typeof script === "string")
  ) {
    throw new Error(
      `${PROJECT_CONFIG_FILE} ${key} must be an array of strings.`,
    );
  }
  return scripts;
}

function readRunScript(config: Record<string, unknown>): string {
  const script = config.run_script;
  if (script === undefined) return "";
  if (typeof script !== "string") {
    throw new Error(`${PROJECT_CONFIG_FILE} run_script must be a string.`);
  }
  return script;
}

function readScriptShell(config: Record<string, unknown>): ProjectScriptShell {
  const shell = config.script_shell;
  if (shell === undefined) return "auto";
  if (shell !== "auto" && shell !== "bash" && shell !== "system") {
    throw new Error(
      `${PROJECT_CONFIG_FILE} script_shell must be auto, bash, or system.`,
    );
  }
  return shell;
}

function validateLifecycleConfig(config: Record<string, unknown>) {
  readCommandList(config, "setup_script");
  readCommandList(config, "teardown_script");
  readCommandList(config, "init_script");
  readRunScript(config);
  readScriptShell(config);
}

function normalizeCommands(commands: string[]) {
  return commands
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
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
