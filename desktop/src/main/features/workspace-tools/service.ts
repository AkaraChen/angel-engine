import type { Dirent } from "node:fs";
import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeResult,
  WorkspaceFileWriteResult,
  WorkspaceGitDiffResult,
  WorkspaceToolGitCommitResult,
  WorkspaceToolGitStatusEntry,
} from "../../../shared/workspace-tools";

import fs from "node:fs/promises";
import path from "node:path";
import is from "@sindresorhus/is";
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

export async function workspaceFileTree(
  rootInput: string,
): Promise<WorkspaceFileTreeResult> {
  const root = await resolveWorkspaceRoot(rootInput);
  const scan = await scanWorkspaceTree(root);
  const gitRoot = await gitRootFor(root);
  const gitStatus = is.nonEmptyString(gitRoot)
    ? await gitStatusEntries({ gitRoot, root }).catch(() => [])
    : [];

  return {
    gitStatus,
    paths: scan.paths,
    root,
    truncated: scan.truncated,
  };
}

export async function workspaceGitDiff(
  rootInput: string,
): Promise<WorkspaceGitDiffResult> {
  const root = await resolveWorkspaceRoot(rootInput);
  const gitRoot = await gitRootFor(root);
  if (!is.nonEmptyString(gitRoot)) {
    return {
      isGitRepository: false,
      root,
      stagedPatch: "",
      status: [],
      unstagedPatch: "",
      warnings: [],
    };
  }

  const [branch, status, stagedPatch, unstagedTrackedPatch] = await Promise.all(
    [
      gitOutput(gitRoot, ["branch", "--show-current"]).catch(() => ""),
      gitStatusEntries({ gitRoot, root }),
      gitOutput(gitRoot, [
        "diff",
        "--cached",
        "--patch",
        "--find-renames",
        "--no-ext-diff",
        "--no-color",
      ]),
      gitOutput(gitRoot, [
        "diff",
        "--patch",
        "--find-renames",
        "--no-ext-diff",
        "--no-color",
      ]),
    ],
  );
  const untrackedResult = await buildUntrackedPatch(root, status);
  const unstagedPatch = joinPatches(
    unstagedTrackedPatch,
    untrackedResult.patch,
  );

  return {
    branch: branch || undefined,
    isGitRepository: true,
    root,
    stagedPatch,
    status,
    unstagedPatch,
    warnings: untrackedResult.warnings,
  };
}

export async function workspaceGitCommit({
  description,
  paths: pathInputs,
  root: rootInput,
  summary,
}: {
  description?: string;
  paths: string[];
  root: string;
  summary: string;
}): Promise<WorkspaceToolGitCommitResult> {
  const root = await resolveWorkspaceRoot(rootInput);
  const gitRoot = await gitRootFor(root);
  if (!is.nonEmptyString(gitRoot)) {
    throw new Error("Workspace root is not a Git repository.");
  }

  const trimmedSummary = summary.trim();
  if (!is.nonEmptyString(trimmedSummary)) {
    throw new Error("Commit summary is required.");
  }

  const paths = uniqueWorkspaceGitPaths(root, pathInputs);
  if (paths.length === 0) {
    throw new Error("Select at least one file to commit.");
  }

  await gitOutput(root, ["add", "--", ...paths]);

  const commitArgs = ["commit", "-m", trimmedSummary];
  const trimmedDescription = description?.trim();
  if (is.nonEmptyString(trimmedDescription)) {
    commitArgs.push("-m", trimmedDescription);
  }
  commitArgs.push("--only", "--", ...paths);

  await gitOutput(root, commitArgs);
  const commitHash = await gitOutput(root, ["rev-parse", "--short", "HEAD"]);

  return {
    commitHash,
    root,
  };
}

export async function workspaceReadFile(
  rootInput: string,
  treePathInput: string,
): Promise<WorkspaceFileReadResult> {
  const root = await resolveWorkspaceRoot(rootInput);
  const absolutePath = resolveWorkspaceTreePath(root, treePathInput);
  const treePath = absolutePathToTreePath(root, absolutePath);
  if (!is.nonEmptyString(treePath)) {
    throw new Error("Workspace file path must stay inside the workspace root.");
  }

  const [realRoot, realPath] = await Promise.all([
    fs.realpath(root),
    fs.realpath(absolutePath),
  ]);
  if (!pathIsInside(realRoot, realPath)) {
    throw new Error("Workspace file path must stay inside the workspace root.");
  }

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
}

export async function workspaceWriteFile(
  rootInput: string,
  treePathInput: string,
  content: string,
): Promise<WorkspaceFileWriteResult> {
  const root = await resolveWorkspaceRoot(rootInput);
  const treePath = normalizeGitPath(treePathInput);
  const absolutePath = resolveWorkspaceTreePath(root, treePath);
  const realRoot = await fs.realpath(root);
  let realPath: string;

  try {
    realPath = await fs.realpath(absolutePath);
  } catch {
    realPath = await realpathNearestExistingParent(absolutePath);
  }

  if (!pathIsInside(realRoot, realPath)) {
    throw new Error("Workspace file path must stay inside the workspace root.");
  }

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");

  return {
    path: treePath,
    root,
    size: Buffer.byteLength(content, "utf8"),
  };
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

async function resolveWorkspaceRoot(rootInput: string) {
  const root = path.resolve(rootInput);
  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    throw new Error("Workspace root must be a directory.");
  }
  return root;
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

async function gitRootFor(root: string) {
  try {
    return await gitOutput(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

async function gitStatusEntries({
  gitRoot,
  root,
}: {
  gitRoot: string;
  root: string;
}) {
  const output = await gitOutput(gitRoot, [
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
}
