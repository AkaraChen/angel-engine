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
import { loadProjectLifecycleConfig } from "./config";
import { getProject } from "./repository";
import { projectSetupLifecycle } from "./setup-lifecycle";

const execFileAsync = promisify(execFile);
const GIT_OUTPUT_MAX_BUFFER = 1024 * 1024;
const GIT_OPERATION_TIMEOUT_MS = 5 * 60 * 1000;
const WORKTREE_BRANCH_PREFIX = "angel";

export function projectGitStatus(
  input: ProjectGitStatusInput,
): Effect.Effect<ProjectGitStatusResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const project = yield* getProject(input.projectId);
    if (!project) {
      return yield* Effect.fail(DaemonError.projectNotFound());
    }

    const baseResult: ProjectGitStatusResult = {
      isDirty: false,
      isGitRepository: false,
      path: project.path,
      projectId: project.id,
    };

    const gitStatus = yield* Effect.gen(function* () {
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

    const root = gitStatus.root;
    if (!gitStatus.isGitRepository || !is.nonEmptyString(root)) {
      return gitStatus;
    }

    const setupConfig = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.worktreeCreateFailed(cause),
      try: () => loadProjectLifecycleConfig(root),
    });

    return {
      ...gitStatus,
      worktreeSetup:
        setupConfig && setupConfig.setupScript.length > 0
          ? {
              commands: setupConfig.setupScript,
              digest: setupConfig.digest,
            }
          : undefined,
    };
  });
}

export function createProjectWorktree(
  input: ProjectWorktreeCreateInput,
  signal?: AbortSignal,
  onProgress?: (
    stage: "fetching" | "worktree" | "setup",
    progress: number,
  ) => void,
): Effect.Effect<ProjectWorktreeCreateResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const status = yield* projectGitStatus(input);
    if (!status.isGitRepository || !is.nonEmptyString(status.root)) {
      return yield* Effect.fail(DaemonError.projectNotGitRepository());
    }
    const root = status.root;
    const setup = status.worktreeSetup;
    if (setup && input.setupApproval !== setup.digest) {
      return yield* Effect.fail(DaemonError.worktreeSetupApprovalRequired());
    }

    onProgress?.("fetching", 10);
    const startPointFetch = input.startPointFetch;
    if (startPointFetch) {
      yield* Effect.tryPromise({
        catch: (cause) => DaemonError.worktreeCreateFailed(cause),
        try: () =>
          execFileAsync(
            "git",
            [
              "-C",
              root,
              "fetch",
              startPointFetch.remote,
              startPointFetch.refspec,
            ],
            {
              maxBuffer: GIT_OUTPUT_MAX_BUFFER,
              signal,
              timeout: GIT_OPERATION_TIMEOUT_MS,
            },
          ),
      });
    } else {
      yield* Effect.tryPromise({
        catch: (cause) => DaemonError.worktreeCreateFailed(cause),
        try: () =>
          execFileAsync("git", ["-C", root, "fetch", "--prune"], {
            maxBuffer: GIT_OUTPUT_MAX_BUFFER,
            signal,
            timeout: GIT_OPERATION_TIMEOUT_MS,
          }),
      });
    }
    onProgress?.("worktree", 45);

    const projectSlug = projectSlugFromPath(status.path);
    const parent = path.join(managedWorktreeRoot(), projectSlug);
    yield* Effect.try({
      catch: (cause) => DaemonError.worktreeCreateFailed(cause),
      try: () => fs.mkdirSync(parent, { recursive: true }),
    });

    const fixedBranch = is.nonEmptyString(input.branchName)
      ? input.branchName.trim()
      : undefined;
    const startPoint = is.nonEmptyString(input.startPoint)
      ? input.startPoint.trim()
      : "HEAD";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
      const cwd = path.join(parent, suffix);
      const branch =
        fixedBranch === undefined
          ? `${WORKTREE_BRANCH_PREFIX}/${projectSlug}-${suffix}`
          : attempt === 0
            ? fixedBranch
            : `${fixedBranch}-${suffix}`;

      const created = yield* Effect.tryPromise({
        catch: (cause) => cause,
        try: () =>
          execFileAsync(
            "git",
            ["-C", root, "worktree", "add", "-b", branch, cwd, startPoint],
            {
              maxBuffer: GIT_OUTPUT_MAX_BUFFER,
              signal,
              timeout: GIT_OPERATION_TIMEOUT_MS,
            },
          ),
      }).pipe(
        Effect.as({ branch, cwd, projectId: input.projectId, root }),
        Effect.catchAll((cause) =>
          Effect.gen(function* () {
            yield* Effect.promise(() =>
              discardCreatedWorktree(root, cwd, branch).catch(() => {
                fs.rmSync(cwd, { force: true, recursive: true });
              }),
            );
            if (signal?.aborted) {
              return yield* Effect.fail(
                DaemonError.worktreeCreateFailed(cause),
              );
            }
            if (attempt === 4) {
              return yield* Effect.fail(
                DaemonError.worktreeCreateFailed(cause),
              );
            }
            return undefined;
          }),
        ),
      );
      if (created !== undefined) {
        onProgress?.("setup", 75);
        if (signal?.aborted) {
          yield* Effect.promise(() =>
            discardCreatedWorktree(root, created.cwd, created.branch),
          );
          return yield* Effect.fail(
            DaemonError.worktreeCreateFailed(signal.reason),
          );
        }
        if (setup) {
          yield* Effect.sync(() =>
            projectSetupLifecycle.start({
              approvedDigest: setup.digest,
              projectRoot: root,
              worktreePath: created.cwd,
            }),
          );
        }
        onProgress?.("setup", 100);
        return created;
      }
    }

    return yield* Effect.fail(DaemonError.worktreeCreateFailed(undefined));
  });
}

export async function discardManagedCreatedWorktree(root: string, cwd: string) {
  const branch = await gitOutputAsync(cwd, ["branch", "--show-current"]);
  if (!branch.startsWith(`${WORKTREE_BRANCH_PREFIX}/`)) {
    throw new Error("Refusing to discard a worktree with an unmanaged branch.");
  }
  await discardCreatedWorktree(root, cwd, branch);
}

export function managedWorktreeRoot() {
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

/** Rolls back a worktree that was created but could not be attached to its chat. */
export function removeCreatedProjectWorktree(
  worktree: ProjectWorktreeCreateResult,
): Effect.Effect<void, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.worktreeRemoveFailed(cause),
    try: () =>
      discardCreatedWorktree(worktree.root, worktree.cwd, worktree.branch),
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

/** Explicit destructive path used by the future Discard workspace action. */
export async function discardCreatedWorktree(
  root: string,
  cwd: string,
  branch: string,
) {
  const operationErrors: unknown[] = [];

  await execFileAsync(
    "git",
    ["-C", root, "worktree", "remove", "--force", cwd],
    { maxBuffer: GIT_OUTPUT_MAX_BUFFER },
  ).catch((cause) => operationErrors.push(cause));

  try {
    fs.rmSync(cwd, { force: true, recursive: true });
  } catch (cause) {
    operationErrors.push(cause);
  }

  await execFileAsync(
    "git",
    ["-C", root, "worktree", "prune", "--expire", "now"],
    { maxBuffer: GIT_OUTPUT_MAX_BUFFER },
  ).catch((cause) => operationErrors.push(cause));

  const branchBeforeDelete = await gitOutputAsync(root, [
    "branch",
    "--list",
    branch,
  ]).catch((cause) => {
    operationErrors.push(cause);
    return branch;
  });
  if (branchBeforeDelete.trim().length > 0) {
    await execFileAsync("git", ["-C", root, "branch", "-D", branch], {
      maxBuffer: GIT_OUTPUT_MAX_BUFFER,
    }).catch((cause) => operationErrors.push(cause));
  }

  const residue: string[] = [];
  if (fs.existsSync(cwd)) residue.push(`directory still exists: ${cwd}`);

  const worktreeList = await gitOutputAsync(root, [
    "worktree",
    "list",
    "--porcelain",
  ]).catch((cause) => {
    operationErrors.push(cause);
    residue.push("could not verify worktree metadata");
    return "";
  });
  if (worktreeList.split(/\r?\n/).some((line) => line === `worktree ${cwd}`)) {
    residue.push(`worktree metadata still exists: ${cwd}`);
  }

  const branchAfterDelete = await gitOutputAsync(root, [
    "branch",
    "--list",
    branch,
  ]).catch((cause) => {
    operationErrors.push(cause);
    residue.push("could not verify worktree branch");
    return "";
  });
  if (branchAfterDelete.trim().length > 0) {
    residue.push(`branch still exists: ${branch}`);
  }

  if (residue.length > 0) {
    throw new AggregateError(
      operationErrors,
      `Could not fully roll back worktree: ${residue.join("; ")}`,
    );
  }
}

function nonEmpty(value: string) {
  const trimmed = value.trim();
  return is.nonEmptyString(trimmed) ? trimmed : undefined;
}

async function gitOutputAsync(cwd: string, args: string[]) {
  const result = await execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
  });
  return result.stdout.trim();
}
