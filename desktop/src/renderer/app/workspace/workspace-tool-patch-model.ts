import type { FileDiffMetadata } from "@pierre/diffs";
import type { WorkspaceGitSkippedFile } from "@angel-engine/daemon-api/workspace-tools";

import { parsePatchFiles } from "@pierre/diffs";
import is from "@sindresorhus/is";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";

export type WorkspaceToolPatchSource = "staged" | "unstaged";

export interface WorkspaceToolFilePatch {
  fileDiff: FileDiffMetadata;
  source: WorkspaceToolPatchSource;
}

export interface WorkspaceToolPatchFile {
  diffs: WorkspaceToolFilePatch[];
  key: string;
  name: string;
  prevName?: string;
  previewNotice?: string;
}

export interface WorkspaceToolPatchFileLineChanges {
  additions: number;
  deletions: number;
}

export function buildWorkspaceToolPatchList(
  stagedPatch: string,
  unstagedPatch: string,
  skippedFiles: WorkspaceGitSkippedFile[] = [],
) {
  const staged = parseWorkspaceToolPatch(stagedPatch, "workspace-tool-staged");
  const unstaged = parseWorkspaceToolPatch(
    unstagedPatch,
    "workspace-tool-unstaged",
  );
  const patchedFiles = groupWorkspaceToolPatchFiles([
    ...staged.files.map((fileDiff) => ({
      fileDiff,
      source: "staged" as const,
    })),
    ...unstaged.files.map((fileDiff) => ({
      fileDiff,
      source: "unstaged" as const,
    })),
  ]);

  const patchedPaths = new Set(patchedFiles.map((file) => file.name));
  const skippedPatchFiles = skippedFiles
    .filter((file) => !patchedPaths.has(file.path))
    .map<WorkspaceToolPatchFile>((file) => ({
      diffs: [],
      key: file.path,
      name: file.path,
      previewNotice: formatWorkspaceGitSkippedFileNotice(file),
    }));
  const files = [...patchedFiles, ...skippedPatchFiles].sort((a, b) =>
    formatWorkspaceToolPatchFileName(a).localeCompare(
      formatWorkspaceToolPatchFileName(b),
    ),
  );

  return {
    errors: [staged.error, unstaged.error].flatMap((error) =>
      is.nonEmptyString(error) ? [error] : [],
    ),
    files,
  };
}

function formatWorkspaceGitSkippedFileNotice(file: WorkspaceGitSkippedFile) {
  if (file.reason === "binary") {
    return `Skipped binary untracked file: ${file.path}`;
  }
  return `Skipped large untracked file: ${file.path}`;
}

export function parseWorkspaceToolPatch(
  patch: string,
  cacheKeyPrefix: string,
): {
  error?: string;
  files: FileDiffMetadata[];
} {
  const trimmedPatch = patch.trim();
  if (!is.nonEmptyString(trimmedPatch)) {
    return { files: [] };
  }

  try {
    return {
      files: parsePatchFiles(trimmedPatch, cacheKeyPrefix, true).flatMap(
        (parsedPatch) => parsedPatch.files,
      ),
    };
  } catch (error) {
    return {
      error: getErrorMessage(error),
      files: [],
    };
  }
}

export function groupWorkspaceToolPatchFiles(diffs: WorkspaceToolFilePatch[]) {
  const groups = new Map<string, WorkspaceToolPatchFile>();

  for (const diff of diffs) {
    const key = diff.fileDiff.name;
    const group = groups.get(key);
    if (group) {
      group.diffs.push(diff);
      continue;
    }

    groups.set(key, {
      diffs: [diff],
      key,
      name: diff.fileDiff.name,
      prevName: diff.fileDiff.prevName,
    });
  }

  return Array.from(groups.values()).sort((a, b) =>
    formatWorkspaceToolPatchFileName(a).localeCompare(
      formatWorkspaceToolPatchFileName(b),
    ),
  );
}

export function formatWorkspaceToolPatchFileName(file: {
  name: string;
  prevName?: string;
}) {
  return is.nonEmptyString(file.prevName)
    ? `${file.prevName} -> ${file.name}`
    : file.name;
}

export function formatWorkspaceToolPatchSource(
  source: WorkspaceToolPatchSource,
) {
  return source === "staged" ? "Staged" : "Unstaged";
}

export function getWorkspaceToolPatchFileLineChanges(
  file: WorkspaceToolPatchFile,
): WorkspaceToolPatchFileLineChanges {
  return file.diffs.reduce<WorkspaceToolPatchFileLineChanges>(
    (total, diff) => ({
      additions: total.additions + diff.fileDiff.additionLines.length,
      deletions: total.deletions + diff.fileDiff.deletionLines.length,
    }),
    { additions: 0, deletions: 0 },
  );
}

export function workspaceToolFileDiffKey(
  source: WorkspaceToolPatchSource,
  fileDiff: FileDiffMetadata,
  index: number,
) {
  return `${source}:${index}:${fileDiff.cacheKey ?? fileDiff.prevName ?? ""}:${fileDiff.name}`;
}

export function workspaceToolFileDiffVersion(fileDiff: FileDiffMetadata) {
  return [
    fileDiff.unifiedLineCount,
    fileDiff.splitLineCount,
    ...fileDiff.hunks.map((hunk) => hunk.hunkSpecs ?? ""),
    ...fileDiff.deletionLines,
    ...fileDiff.additionLines,
  ].join("\n");
}
