import type {
  ProjectConfigInput,
  ProjectConfigResult,
  UpdateProjectConfigInput,
} from "@angel-engine/daemon-api/projects";
import type { Db } from "../../platform/db";
import fs from "node:fs";
import path from "node:path";

import { PROJECT_CONFIG_FILE_NAME } from "@angel-engine/daemon-api/projects";
import is from "@sindresorhus/is";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { projectGitStatus } from "./git";

const SETUP_SCRIPT_KEY = "setup_script";

/**
 * The parsed `2code.json` object. Unknown keys are preserved verbatim on save,
 * so the shape stays open at this boundary and is narrowed immediately below.
 */
type ProjectConfigFile = Record<string, unknown>;

export function readProjectConfig(
  input: ProjectConfigInput,
): Effect.Effect<ProjectConfigResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const configPath = yield* resolveConfigPath(input.projectId);
    const file = yield* readConfigFile(configPath);

    return {
      configPath,
      exists: file !== null,
      projectId: input.projectId,
      setupScript:
        file === null ? [] : yield* readSetupScript(file, configPath),
    };
  });
}

export function updateProjectConfig(
  input: UpdateProjectConfigInput,
): Effect.Effect<ProjectConfigResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const configPath = yield* resolveConfigPath(input.projectId);
    // Read before write so a corrupt file fails loudly instead of being
    // silently replaced, and so unknown keys survive the merge.
    const file = yield* readConfigFile(configPath);
    if (file !== null) yield* readSetupScript(file, configPath);

    const setupScript = normalizeSetupScript(input.setupScript);
    const nextFile: ProjectConfigFile = {
      ...(file ?? {}),
      [SETUP_SCRIPT_KEY]: setupScript,
    };

    yield* Effect.try({
      catch: (cause) => DaemonError.projectConfigWriteFailed(cause),
      try: () =>
        fs.writeFileSync(
          configPath,
          `${JSON.stringify(nextFile, null, 2)}\n`,
          "utf8",
        ),
    });

    return {
      configPath,
      exists: true,
      projectId: input.projectId,
      setupScript,
    };
  });
}

/**
 * Setup scripts are stored one command per entry. Blank lines the editor UI
 * produces are dropped rather than persisted as no-op commands.
 */
function normalizeSetupScript(setupScript: string[]): string[] {
  return setupScript
    .map((command) => command.trim())
    .filter((command) => command.length > 0);
}

function resolveConfigPath(
  projectId: string,
): Effect.Effect<string, DaemonError, Db> {
  return Effect.gen(function* () {
    const status = yield* projectGitStatus({ projectId });
    const root = is.nonEmptyString(status.root) ? status.root : status.path;
    return path.join(root, PROJECT_CONFIG_FILE_NAME);
  });
}

function readConfigFile(
  configPath: string,
): Effect.Effect<ProjectConfigFile | null, DaemonError> {
  return Effect.gen(function* () {
    if (!fs.existsSync(configPath)) return null;

    const raw = yield* Effect.try({
      catch: (cause) =>
        DaemonError.projectConfigInvalid(
          `Could not read ${PROJECT_CONFIG_FILE_NAME}: ${messageOf(cause)}`,
        ),
      try: () => fs.readFileSync(configPath, "utf8"),
    });

    const parsed = yield* Effect.try({
      catch: (cause) =>
        DaemonError.projectConfigInvalid(
          `${PROJECT_CONFIG_FILE_NAME} is not valid JSON: ${messageOf(cause)}`,
        ),
      try: (): unknown => JSON.parse(raw),
    });

    if (!is.plainObject(parsed)) {
      return yield* Effect.fail(
        DaemonError.projectConfigInvalid(
          `${PROJECT_CONFIG_FILE_NAME} must contain a JSON object.`,
        ),
      );
    }

    return parsed;
  });
}

function readSetupScript(
  file: ProjectConfigFile,
  configPath: string,
): Effect.Effect<string[], DaemonError> {
  const value = file[SETUP_SCRIPT_KEY];
  if (value === undefined) return Effect.succeed([]);
  if (!is.array(value, is.string)) {
    return Effect.fail(
      DaemonError.projectConfigInvalid(
        `${SETUP_SCRIPT_KEY} in ${configPath} must be an array of strings.`,
      ),
    );
  }
  return Effect.succeed(value);
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
