import type { Dirent } from "node:fs";
import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeResult,
  WorkspaceFileWriteResult,
  WorkspaceGitDiffResult,
  WorkspaceToolGitCommitResult,
  WorkspaceToolGitStatusEntry,
} from "@angel-engine/daemon-api/workspace-tools";

import fs from "node:fs/promises";
import path from "node:path";
import is from "@sindresorhus/is";
import { Effect } from "effect";
import { DaemonError } from "../../platform/errors";
import {
  buildUntrackedPatch,
  gitOutput,
  higherPriorityStatus,
  isProbablyBinary,
  joinPatches,
  parseGitStatusOutput,
} from "./git";
import {
  absolutePathToTreePath,
  isMissingPathError,
  normalizeGitPath,
  pathIsInside,
  resolveWorkspaceTreePath,
  toTreePath,
  uniqueWorkspaceGitPaths,
} from "./paths";

const MAX_TREE_ENTRIES = 12_000;
const MAX_FILE_PREVIEW_BYTES = 512 * 1024;
const IGNORED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".turbo",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
  "target",
]);

export function workspaceFileTree(
  rootInput: string,
): Effect.Effect<WorkspaceFileTreeResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const scan = yield* Effect.promise(() => scanWorkspaceTree(root));
    const gitRoot = yield* gitRootFor(root);
    const gitStatus = is.nonEmptyString(gitRoot)
      ? yield* gitStatusEntries({ gitRoot, root }).pipe(
          Effect.orElseSucceed((): WorkspaceToolGitStatusEntry[] => []),
        )
      : [];

    return {
      gitStatus,
      paths: scan.paths,
      root,
      truncated: scan.truncated,
    };
  });
}

export function workspaceGitDiff(
  rootInput: string,
): Effect.Effect<WorkspaceGitDiffResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const gitRoot = yield* gitRootFor(root);
    if (!is.nonEmptyString(gitRoot)) {
      return {
        isGitRepository: false,
        root,
        skippedFiles: [],
        stagedPatch: "",
        status: [],
        unstagedPatch: "",
        warnings: [],
      };
    }

    const [branch, status, stagedPatch, unstagedTrackedPatch] =
      yield* Effect.all(
        [
          workspaceGitOutput(gitRoot, ["branch", "--show-current"]).pipe(
            Effect.orElseSucceed(() => ""),
          ),
          gitStatusEntries({ gitRoot, root }),
          workspaceGitOutput(gitRoot, [
            "diff",
            "--cached",
            "--patch",
            "--find-renames",
            "--no-ext-diff",
            "--no-color",
          ]),
          workspaceGitOutput(gitRoot, [
            "diff",
            "--patch",
            "--find-renames",
            "--no-ext-diff",
            "--no-color",
          ]),
        ],
        { concurrency: "unbounded" },
      );
    const untrackedResult = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.gitFailed(cause),
      try: () => buildUntrackedPatch(root, status),
    });
    const unstagedPatch = joinPatches(
      unstagedTrackedPatch,
      untrackedResult.patch,
    );

    return {
      branch: branch || undefined,
      isGitRepository: true,
      root,
      skippedFiles: untrackedResult.skippedFiles,
      stagedPatch,
      status,
      unstagedPatch,
      warnings: untrackedResult.warnings,
    };
  });
}

export function workspaceGitCommit({
  description,
  paths: pathInputs,
  root: rootInput,
  summary,
}: {
  description?: string;
  paths: string[];
  root: string;
  summary: string;
}): Effect.Effect<WorkspaceToolGitCommitResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const gitRoot = yield* gitRootFor(root);
    if (!is.nonEmptyString(gitRoot)) {
      return yield* Effect.fail(DaemonError.workspaceNotGitRepository());
    }

    const trimmedSummary = summary.trim();
    if (!is.nonEmptyString(trimmedSummary)) {
      return yield* Effect.fail(
        DaemonError.workspaceCommitInputInvalid("Commit summary is required."),
      );
    }

    const paths = uniqueWorkspaceGitPaths(root, pathInputs);
    if (paths.length === 0) {
      return yield* Effect.fail(
        DaemonError.workspaceCommitInputInvalid(
          "Select at least one file to commit.",
        ),
      );
    }

    yield* workspaceGitOutput(root, ["add", "--", ...paths]);

    const commitArgs = ["commit", "-m", trimmedSummary];
    const trimmedDescription = description?.trim();
    if (is.nonEmptyString(trimmedDescription)) {
      commitArgs.push("-m", trimmedDescription);
    }
    commitArgs.push("--only", "--", ...paths);

    yield* workspaceGitOutput(root, commitArgs);
    const commitHash = yield* workspaceGitOutput(root, [
      "rev-parse",
      "--short",
      "HEAD",
    ]);

    return {
      commitHash,
      root,
    };
  });
}

export function workspaceReadFile(
  rootInput: string,
  treePathInput: string,
): Effect.Effect<WorkspaceFileReadResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const absolutePath = yield* Effect.try({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: () => resolveWorkspaceTreePath(root, treePathInput),
    });
    const treePath = absolutePathToTreePath(root, absolutePath);
    if (!is.nonEmptyString(treePath)) {
      return yield* Effect.fail(
        DaemonError.workspacePathInvalid(
          "Workspace file path must stay inside the workspace root.",
        ),
      );
    }

    const [realRoot, realPath] = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: () => Promise.all([fs.realpath(root), fs.realpath(absolutePath)]),
    });
    if (!pathIsInside(realRoot, realPath)) {
      return yield* Effect.fail(
        DaemonError.workspacePathInvalid(
          "Workspace file path must stay inside the workspace root.",
        ),
      );
    }

    return yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: async (): Promise<WorkspaceFileReadResult> => {
        const stat = await fs.stat(realPath);

        if (!stat.isFile()) {
          return {
            path: treePath,
            reason: "not-file",
            root,
            size: stat.size,
            type: "unsupported",
          };
        }

        if (stat.size > MAX_FILE_PREVIEW_BYTES) {
          return {
            path: treePath,
            reason: "too-large",
            root,
            size: stat.size,
            type: "unsupported",
          };
        }

        const buffer = await fs.readFile(realPath);
        if (isProbablyBinary(buffer)) {
          return {
            path: treePath,
            reason: "binary",
            root,
            size: stat.size,
            type: "unsupported",
          };
        }

        return {
          content: buffer.toString("utf8"),
          path: treePath,
          root,
          size: stat.size,
          type: "text",
        };
      },
    });
  });
}

export function workspaceWriteFile(
  rootInput: string,
  treePathInput: string,
  content: string,
): Effect.Effect<WorkspaceFileWriteResult, DaemonError> {
  return Effect.gen(function* () {
    const root = yield* resolveWorkspaceRoot(rootInput);
    const { absolutePath, treePath } = yield* Effect.try({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: () => {
        const normalizedTreePath = normalizeGitPath(treePathInput);
        return {
          absolutePath: resolveWorkspaceTreePath(root, normalizedTreePath),
          treePath: normalizedTreePath,
        };
      },
    });
    const { realPath, realRoot } = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: async () => {
        const resolvedRoot = await fs.realpath(root);
        let resolvedPath: string;
        try {
          resolvedPath = await fs.realpath(absolutePath);
        } catch {
          resolvedPath = await realpathNearestExistingParent(absolutePath);
        }
        return { realPath: resolvedPath, realRoot: resolvedRoot };
      },
    });

    if (!pathIsInside(realRoot, realPath)) {
      return yield* Effect.fail(
        DaemonError.workspacePathInvalid(
          "Workspace file path must stay inside the workspace root.",
        ),
      );
    }

    yield* Effect.tryPromise({
      catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
      try: async () => {
        await fs.mkdir(path.dirname(absolutePath), { recursive: true });
        await fs.writeFile(absolutePath, content, "utf8");
      },
    });

    return {
      path: treePath,
      root,
      size: Buffer.byteLength(content, "utf8"),
    };
  });
}

async function realpathNearestExistingParent(absolutePath: string) {
  let directory = path.dirname(absolutePath);

  while (true) {
    try {
      const stat = await fs.stat(directory);
      if (!stat.isDirectory()) {
        throw new Error("Workspace file parent must be a directory.");
      }
      return await fs.realpath(directory);
    } catch (error) {
      if (!isMissingPathError(error)) {
        throw error;
      }
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("Workspace file parent must exist.");
    }
    directory = parent;
  }
}

function resolveWorkspaceRoot(
  rootInput: string,
): Effect.Effect<string, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.workspacePathInvalid(causeMessage(cause)),
    try: async () => {
      const root = path.resolve(rootInput);
      const stat = await fs.stat(root);
      if (!stat.isDirectory()) {
        throw new Error("Workspace root must be a directory.");
      }
      return root;
    },
  });
}

async function scanWorkspaceTree(root: string) {
  const paths: string[] = [];
  const dirs = [root];
  let visited = 0;
  let truncated = false;

  while (dirs.length > 0) {
    const dir = dirs.shift();
    if (!is.nonEmptyString(dir)) break;

    let entries: Dirent<string>[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    for (const entry of entries) {
      if (visited >= MAX_TREE_ENTRIES) {
        truncated = true;
        break;
      }
      visited += 1;

      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        paths.push(toTreePath(root, absolutePath, true));
        dirs.push(absolutePath);
        continue;
      }

      if (!entry.isFile() && !entry.isSymbolicLink()) {
        continue;
      }
      paths.push(toTreePath(root, absolutePath, false));
    }

    if (truncated) break;
  }

  return { paths, truncated };
}

function workspaceGitOutput(
  cwd: string,
  args: string[],
): Effect.Effect<string, DaemonError> {
  return Effect.tryPromise({
    catch: (cause) => DaemonError.gitFailed(cause),
    try: () => gitOutput(cwd, args),
  });
}

function gitRootFor(root: string): Effect.Effect<string | null, never> {
  return workspaceGitOutput(root, ["rev-parse", "--show-toplevel"]).pipe(
    Effect.orElseSucceed(() => null),
  );
}

function gitStatusEntries({
  gitRoot,
  root,
}: {
  gitRoot: string;
  root: string;
}): Effect.Effect<WorkspaceToolGitStatusEntry[], DaemonError> {
  return Effect.gen(function* () {
    const output = yield* workspaceGitOutput(gitRoot, [
      "status",
      "--porcelain=v1",
      "--ignored=matching",
      "--untracked-files=all",
      "-z",
    ]);
    const entries = parseGitStatusOutput(output);
    const byPath = new Map<string, WorkspaceToolGitStatusEntry>();

    for (const entry of entries) {
      const absolutePath = path.resolve(gitRoot, entry.path);
      const treePath = absolutePathToTreePath(root, absolutePath);
      if (!is.nonEmptyString(treePath)) continue;

      const current = byPath.get(treePath);
      if (!current) {
        byPath.set(treePath, { ...entry, path: treePath });
        continue;
      }

      byPath.set(treePath, {
        path: treePath,
        staged: current.staged || entry.staged,
        status: higherPriorityStatus(current.status, entry.status),
        unstaged: current.unstaged || entry.unstaged,
      });
    }

    return [...byPath.values()].sort((left, right) =>
      left.path.localeCompare(right.path),
    );
  });
}

function causeMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause);
}
