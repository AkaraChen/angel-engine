import type {
  WorkspaceFileReadResult,
  WorkspaceFileTreeResult,
  WorkspaceGitDiffResult,
  WorkspaceToolGitStatus,
  WorkspaceToolGitStatusEntry,
} from "../../../shared/workspace-tools";
import type { Dirent } from "node:fs";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_TREE_ENTRIES = 12_000;
const GIT_OUTPUT_MAX_BUFFER = 12 * 1024 * 1024;
const MAX_FILE_PREVIEW_BYTES = 512 * 1024;
const MAX_UNTRACKED_PATCH_BYTES = 512 * 1024;
const MAX_TOTAL_UNTRACKED_PATCH_BYTES = 2 * 1024 * 1024;
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
  const gitStatus = gitRoot
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
  if (!gitRoot) {
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

export async function workspaceReadFile(
  rootInput: string,
  treePathInput: string,
): Promise<WorkspaceFileReadResult> {
  const root = await resolveWorkspaceRoot(rootInput);
  const absolutePath = resolveWorkspaceTreePath(root, treePathInput);
  const treePath = absolutePathToTreePath(root, absolutePath);
  if (!treePath) {
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
    if (!dir) break;

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
    if (!treePath) continue;

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

function parseGitStatusOutput(output: string) {
  const parts = output.split("\0").filter(Boolean);
  const entries: WorkspaceToolGitStatusEntry[] = [];

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (part.length < 4) continue;

    const x = part[0] ?? " ";
    const y = part[1] ?? " ";
    const rawPath = part.slice(3);
    if (!rawPath) continue;

    const status = statusFromPorcelain(x, y);
    entries.push({
      path: normalizeGitPath(rawPath),
      staged: x !== " " && x !== "?" && x !== "!",
      status,
      unstaged: y !== " " || x === "?" || x === "!",
    });

    if ((x === "R" || x === "C") && parts[index + 1]) {
      index += 1;
    }
  }

  return entries;
}

function statusFromPorcelain(x: string, y: string): WorkspaceToolGitStatus {
  if (x === "!" || y === "!") return "ignored";
  if (x === "?" || y === "?") return "untracked";
  if (x === "R" || y === "R" || x === "C" || y === "C") return "renamed";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  return "modified";
}

function higherPriorityStatus(
  left: WorkspaceToolGitStatus,
  right: WorkspaceToolGitStatus,
) {
  const priority: Record<WorkspaceToolGitStatus, number> = {
    added: 4,
    deleted: 4,
    ignored: 1,
    modified: 3,
    renamed: 4,
    untracked: 2,
  };
  return priority[right] > priority[left] ? right : left;
}

async function buildUntrackedPatch(
  root: string,
  status: WorkspaceToolGitStatusEntry[],
) {
  const warnings: string[] = [];
  const patches: string[] = [];
  let totalBytes = 0;

  for (const entry of status) {
    if (entry.status !== "untracked") continue;

    const absolutePath = path.join(root, fromTreePath(entry.path));
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;

    if (stat.size > MAX_UNTRACKED_PATCH_BYTES) {
      warnings.push(`Skipped large untracked file: ${entry.path}`);
      continue;
    }
    if (totalBytes + stat.size > MAX_TOTAL_UNTRACKED_PATCH_BYTES) {
      warnings.push(
        "Skipped remaining untracked files after patch size limit.",
      );
      break;
    }

    const buffer = await fs.readFile(absolutePath);
    if (isProbablyBinary(buffer)) {
      warnings.push(`Skipped binary untracked file: ${entry.path}`);
      continue;
    }

    totalBytes += buffer.byteLength;
    patches.push(createNewFilePatch(entry.path, buffer.toString("utf8")));
  }

  return {
    patch: joinPatches(...patches),
    warnings,
  };
}

function createNewFilePatch(treePath: string, contents: string) {
  const normalizedContents = contents.replaceAll("\r\n", "\n");
  const hasTrailingNewline =
    normalizedContents.length === 0 || normalizedContents.endsWith("\n");
  const lines = normalizedContents.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  const lineCount = lines.length;
  const patchLines = [
    `diff --git a/${treePath} b/${treePath}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${treePath}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...lines.map((line) => `+${line}`),
  ];

  if (!hasTrailingNewline) {
    patchLines.push("\\ No newline at end of file");
  }

  return patchLines.join("\n");
}

function isProbablyBinary(buffer: Buffer) {
  return buffer.includes(0);
}

async function gitOutput(cwd: string, args: string[]) {
  const result = await execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
  });
  return result.stdout.trim();
}

function joinPatches(...patches: string[]) {
  return patches
    .map((patch) => patch.trim())
    .filter((patch) => patch.length > 0)
    .join("\n\n");
}

function toTreePath(root: string, absolutePath: string, directory: boolean) {
  const relativePath = path.relative(root, absolutePath);
  const normalized = normalizeGitPath(relativePath);
  return directory && !normalized.endsWith("/") ? `${normalized}/` : normalized;
}

function absolutePathToTreePath(root: string, absolutePath: string) {
  const relativePath = path.relative(root, absolutePath);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return normalizeGitPath(relativePath);
}

function resolveWorkspaceTreePath(root: string, treePathInput: string) {
  const absolutePath = path.resolve(root, fromTreePath(treePathInput));
  const relativePath = path.relative(root, absolutePath);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Workspace file path must stay inside the workspace root.");
  }

  return absolutePath;
}

function pathIsInside(root: string, absolutePath: string) {
  const relativePath = path.relative(root, absolutePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

function normalizeGitPath(value: string) {
  return value.split(path.sep).join("/");
}

function fromTreePath(value: string) {
  return value.split("/").join(path.sep);
}
