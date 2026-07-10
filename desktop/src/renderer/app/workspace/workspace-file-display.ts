import type { WorkspaceFileReadResult } from "@shared/workspace-tools";

export function formatUnsupportedFileReason(
  result: Extract<WorkspaceFileReadResult, { type: "unsupported" }>,
) {
  switch (result.reason) {
    case "binary":
      return "Binary file";
    case "not-file":
      return "Not a file";
    case "too-large":
      return result.size === undefined
        ? "File is too large"
        : `File is too large (${formatBytes(result.size)})`;
  }
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function workspaceToolRootName(root: string) {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}
