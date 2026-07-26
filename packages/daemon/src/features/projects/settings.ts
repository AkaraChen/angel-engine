import type {
  ProjectConfigInput,
  ProjectConfigResult,
  UpdateProjectConfigInput,
} from "@angel-engine/daemon-api/projects";
import type { Db } from "../../platform/db";

import is from "@sindresorhus/is";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import {
  loadProjectSetupConfig,
  projectConfigPath,
  saveProjectSetupScript,
} from "./config";
import { projectGitStatus } from "./git";

/**
 * Read/write side of the per-project `2code.json`. File parsing and the setup
 * runner live in `./config`; this module only maps a project id onto that file
 * and translates failures into daemon errors.
 */

export function readProjectConfig(
  input: ProjectConfigInput,
): Effect.Effect<ProjectConfigResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const root = yield* resolveProjectRoot(input.projectId);
    const configPath = projectConfigPath(root);
    const config = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.projectConfigInvalid(messageOf(cause)),
      try: () => loadProjectSetupConfig(root),
    });

    return {
      configPath,
      exists: config !== undefined,
      projectId: input.projectId,
      setupScript: config?.scripts ?? [],
    };
  });
}

export function updateProjectConfig(
  input: UpdateProjectConfigInput,
): Effect.Effect<ProjectConfigResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const root = yield* resolveProjectRoot(input.projectId);
    // Validate first so an unparsable file reports as a config error rather
    // than an I/O error, and is never silently replaced.
    yield* Effect.tryPromise({
      catch: (cause) => DaemonError.projectConfigInvalid(messageOf(cause)),
      try: () => loadProjectSetupConfig(root),
    });
    const setupScript = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.projectConfigWriteFailed(cause),
      try: () => saveProjectSetupScript(root, input.setupScript),
    });

    return {
      configPath: projectConfigPath(root),
      exists: true,
      projectId: input.projectId,
      setupScript,
    };
  });
}

function resolveProjectRoot(
  projectId: string,
): Effect.Effect<string, DaemonError, Db> {
  return Effect.gen(function* () {
    const status = yield* projectGitStatus({ projectId });
    return is.nonEmptyString(status.root) ? status.root : status.path;
  });
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
