import type {
  WorkspaceGitSkippedFile,
  WorkspaceToolGitStatus,
  WorkspaceToolGitStatusEntry,
} from "@angel-engine/daemon-api/workspace-tools";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fromTreePath, normalizeGitPath } from "./paths";

const execFileAsync = promisify(execFile);

const GIT_OUTPUT_MAX_BUFFER = 12 * 1024 * 1024;
const GIT_NETWORK_TIMEOUT_MS = 120_000;
const MAX_UNTRACKED_PATCH_BYTES = 512 * 1024;
const MAX_TOTAL_UNTRACKED_PATCH_BYTES = 2 * 1024 * 1024;

export function parseGitStatusOutput(output: string) {
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
      conflicted: isConflictPorcelain(x, y),
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

/**
 * Porcelain v1 unmerged states: either side is `U`, or both sides carry the
 * same `A`/`D` letter. Everything else is a normal staged/unstaged change.
 */
function isConflictPorcelain(x: string, y: string) {
  if (x === "U" || y === "U") return true;
  return x === y && (x === "A" || x === "D");
}

function statusFromPorcelain(x: string, y: string): WorkspaceToolGitStatus {
  if (x === "!" || y === "!") return "ignored";
  if (x === "?" || y === "?") return "untracked";
  if (x === "R" || y === "R" || x === "C" || y === "C") return "renamed";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  return "modified";
}

export function higherPriorityStatus(
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

export async function buildUntrackedPatch(
  root: string,
  status: WorkspaceToolGitStatusEntry[],
) {
  const warnings: string[] = [];
  const patches: string[] = [];
  const skippedFiles: WorkspaceGitSkippedFile[] = [];
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
      skippedFiles.push({
        path: entry.path,
        reason: "too-large",
        size: stat.size,
      });
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
      skippedFiles.push({
        path: entry.path,
        reason: "binary",
        size: stat.size,
      });
      continue;
    }

    totalBytes += buffer.byteLength;
    patches.push(createNewFilePatch(entry.path, buffer.toString("utf8")));
  }

  return {
    patch: joinPatches(...patches),
    skippedFiles,
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

export function isProbablyBinary(buffer: Buffer) {
  return buffer.includes(0);
}

export async function gitOutput(
  cwd: string,
  args: string[],
  options: { network?: boolean } = {},
) {
  const result = await execFileAsync("git", ["-C", cwd, ...args], {
    env: options.network ? nonInteractiveGitEnv() : process.env,
    maxBuffer: GIT_OUTPUT_MAX_BUFFER,
    timeout: options.network ? GIT_NETWORK_TIMEOUT_MS : undefined,
  });
  return result.stdout.trim();
}

/**
 * A push that reaches a credential prompt would hang the daemon forever with
 * nowhere to type. Fail fast instead so the UI can report an auth problem.
 */
function nonInteractiveGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_ASKPASS: "",
    GIT_TERMINAL_PROMPT: "0",
    SSH_ASKPASS: "",
    SSH_ASKPASS_REQUIRE: "never",
  };
}

/** Parses `git rev-list --left-right --count HEAD...@{upstream}` output. */
export function parseAheadBehindCounts(output: string) {
  const [ahead, behind] = output
    .split(/\s+/)
    .filter(Boolean)
    .map((value) => Number.parseInt(value, 10));

  return {
    ahead: Number.isInteger(ahead) ? Number(ahead) : 0,
    behind: Number.isInteger(behind) ? Number(behind) : 0,
  };
}

export function joinPatches(...patches: string[]) {
  return patches
    .map((patch) => patch.trim())
    .filter((patch) => patch.length > 0)
    .join("\n\n");
}
