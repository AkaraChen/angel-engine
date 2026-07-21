import type {
  ProjectGitStatusInput,
  ProjectGitStatusResult,
  ProjectWorktreeCreateInput,
  ProjectWorktreeCreateResult,
} from "@angel-engine/daemon-api/projects";
import type { Db } from "../../platform/db";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import is from "@sindresorhus/is";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { getProject } from "./repository";

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_MAX_BUFFER = 1024 * 1024;
const WORKTREE_BRANCH_PREFIX = "angel";

export function projectGitStatus(
  input: ProjectGitStatusInput,
): Effect.Effect<ProjectGitStatusResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const project = yield* getProject(input.projectId);
    if (!project) {
      return yield* Effect.fail(DaemonError.projectNotFound());
    }

    const baseResult = {
      isDirty: false,
      isGitRepository: false,
      path: project.path,
      projectId: project.id,
    };

    return yield* Effect.gen(function* () {
      const root = yield* gitOutput(project.path, [
        "rev-parse",
        "--show-toplevel",
      ]);
      const branch = yield* gitOutput(project.path, [
        "branch",
        "--show-current",
      ]).pipe(Effect.orElseSucceed(() => ""));
      const status = yield* gitOutput(project.path, ["status", "--porcelain"]);

      return {
        ...baseResult,
        branch: nonEmpty(branch),
        isDirty: status.trim().length > 0,
        isGitRepository: true,
        root: root.trim(),
      };
    }).pipe(Effect.orElseSucceed(() => baseResult));
  });
}

export function createProjectWorktree(
  input: ProjectWorktreeCreateInput,
): Effect.Effect<ProjectWorktreeCreateResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const status = yield* projectGitStatus(input);
    if (!status.isGitRepository || !is.nonEmptyString(status.root)) {
      return yield* Effect.fail(DaemonError.projectNotGitRepository());
    }
    const root = status.root;

    const projectSlug = projectSlugFromPath(status.path);
    const parent = path.join(managedWorktreeRoot(), projectSlug);
    yield* Effect.try({
      catch: (cause) => DaemonError.worktreeCreateFailed(cause),
      try: () => fs.mkdirSync(parent, { recursive: true }),
    });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
      const cwd = path.join(parent, suffix);
      const branch = `${WORKTREE_BRANCH_PREFIX}/${projectSlug}-${suffix}`;

      const created = yield* Effect.tryPromise({
        catch: (cause) => cause,
        try: () =>
          execFileAsync(
            "git",
            ["-C", root, "worktree", "add", "-b", branch, cwd, "HEAD"],
            { maxBuffer: GIT_OUTPUT_MAX_BUFFER },
          ),
      }).pipe(
        Effect.as({ branch, cwd, projectId: input.projectId, root }),
        Effect.catchAll((cause) =>
          Effect.gen(function* () {
            yield* Effect.sync(() =>
              fs.rmSync(cwd, { force: true, recursive: true }),
            );
            if (attempt === 4) {
              return yield* Effect.fail(
                DaemonError.worktreeCreateFailed(cause),
              );
            }
            return undefined;
          }),
        ),
      );
      if (created !== undefined) return created;
    }

    return yield* Effect.fail(DaemonError.worktreeCreateFailed(undefined));
  });
}

function managedWorktreeRoot() {
  return path.join(os.homedir(), ".angel-engine", "worktrees");
}

export function managedWorktreePath(cwd: string | null | undefined) {
  if (!is.nonEmptyString(cwd)) return undefined;

  const root = path.resolve(managedWorktreeRoot());
  const resolvedCwd = path.resolve(cwd);
  const relativePath = path.relative(root, resolvedCwd);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  const parts = relativePath.split(path.sep).filter(Boolean);
  if (parts.length < 2) return undefined;

  return path.join(root, parts[0], parts[1]);
}

export function removeManagedWorktree(
  cwd: string | null | undefined,
): Effect.Effect<string | undefined, DaemonError> {
  return Effect.gen(function* () {
    const worktreePath = managedWorktreePath(cwd);
    if (!is.nonEmptyString(worktreePath)) return undefined;

    if (fs.existsSync(worktreePath)) {
      yield* removeGitWorktree(worktreePath).pipe(
        Effect.orElseSucceed(() => undefined),
      );
      if (fs.existsSync(worktreePath)) {
        yield* Effect.try({
          catch: (cause) => DaemonError.worktreeRemoveFailed(cause),
          try: () => fs.rmSync(worktreePath, { force: true, recursive: true }),
        });
      }
    }

    return worktreePath;
  });
}

function projectSlugFromPath(projectPath: string) {
  const slug = path
    .basename(projectPath)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return slug || "project";
}

function gitOutput(
  cwd: string,
  args: string[],
): Effect.Effect<string, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: async () => {
      const result = await execFileAsync("git", ["-C", cwd, ...args], {
        maxBuffer: GIT_OUTPUT_MAX_BUFFER,
      });
      return result.stdout.trim();
    },
  });
}

function removeGitWorktree(
  worktreePath: string,
): Effect.Effect<void, DaemonError> {
  return Effect.gen(function* () {
    const gitCommonDir = yield* gitOutput(worktreePath, [
      "rev-parse",
      "--path-format=absolute",
      "--git-common-dir",
    ]);
    const gitRoot = path.dirname(gitCommonDir);

    yield* Effect.tryPromise({
      catch: (cause) => DaemonError.worktreeRemoveFailed(cause),
      try: () =>
        execFileAsync(
          "git",
          ["-C", gitRoot, "worktree", "remove", "--force", worktreePath],
          { maxBuffer: GIT_OUTPUT_MAX_BUFFER },
        ),
    });
  });
}

function nonEmpty(value: string) {
  const trimmed = value.trim();
  return is.nonEmptyString(trimmed) ? trimmed : undefined;
}
