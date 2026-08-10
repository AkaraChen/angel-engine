import type { FileDiffMetadata } from "@pierre/diffs";
import type { WorkspaceToolPatchSource } from "@/app/workspace/workspace-tool-patch-model";

export type DiffCommentSide = "additions" | "deletions";
export type DiffCommentStatus = "open" | "pending" | "resolved";

export interface DiffComment {
  body: string;
  id: string;
  lineNumber: number;
  path: string;
  root: string;
  selected: boolean;
  side: DiffCommentSide;
  snippet: string;
  source?: WorkspaceToolPatchSource;
  status: DiffCommentStatus;
}

export interface CreateDiffCommentInput {
  body?: string;
  lineNumber: number;
  path: string;
  root: string;
  side: DiffCommentSide;
  snippet?: string;
  source?: WorkspaceToolPatchSource;
}

/** Extract a single line of code from a parsed pierre FileDiffMetadata. */
export function getDiffLineSnippet(
  fileDiff: FileDiffMetadata,
  side: DiffCommentSide,
  lineNumber: number,
): string {
  if (!Number.isFinite(lineNumber) || lineNumber < 1) {
    return "";
  }

  const lines =
    side === "additions" ? fileDiff.additionLines : fileDiff.deletionLines;

  for (const hunk of fileDiff.hunks) {
    const start =
      side === "additions" ? hunk.additionStart : hunk.deletionStart;
    const count =
      side === "additions" ? hunk.additionCount : hunk.deletionCount;
    const lineIndex =
      side === "additions" ? hunk.additionLineIndex : hunk.deletionLineIndex;
    if (lineNumber < start || lineNumber >= start + count) {
      continue;
    }
    const offset = lineNumber - start;
    return lines[lineIndex + offset] ?? "";
  }

  // Full-file metadata (non-partial): line arrays are the whole file, 1-indexed.
  if (!fileDiff.isPartial && lineNumber <= lines.length) {
    return lines[lineNumber - 1] ?? "";
  }

  return "";
}

export function createDiffComment(input: CreateDiffCommentInput): DiffComment {
  return {
    body: input.body?.trim() ?? "",
    id: createDiffCommentId(),
    lineNumber: input.lineNumber,
    path: input.path,
    root: input.root,
    selected: true,
    side: input.side,
    snippet: input.snippet ?? "",
    source: input.source,
    status: "open",
  };
}

export function isSendableDiffComment(comment: DiffComment) {
  return (
    comment.selected &&
    comment.status !== "resolved" &&
    comment.body.trim().length > 0
  );
}

/**
 * Format selected annotations as a structured prompt the agent can act on.
 * Keep path + line + side + snippet + body — no provider-specific wire.
 */
export function formatDiffCommentsForAgent(comments: DiffComment[]): string {
  const sendable = comments.filter(isSendableDiffComment);
  if (sendable.length === 0) {
    return "";
  }

  const sorted = [...sendable].sort((a, b) => {
    const pathCmp = a.path.localeCompare(b.path);
    if (pathCmp !== 0) return pathCmp;
    if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber;
    return a.side.localeCompare(b.side);
  });

  const blocks = sorted.map((comment, index) => {
    const sideLabel = comment.side === "additions" ? "new" : "old";
    const snippet =
      comment.snippet.trim().length > 0
        ? comment.snippet.replace(/\r?\n/g, " ")
        : "(no line text)";
    return [
      `### Comment ${index + 1}`,
      `- Path: ${comment.path}`,
      `- Line: ${comment.lineNumber} (${sideLabel})`,
      `- Snippet: \`${snippet}\``,
      `- Note: ${comment.body.trim()}`,
    ].join("\n");
  });

  return [
    "Please address the following review comments on the current diff.",
    "Only change what these comments request.",
    "",
    ...blocks,
  ].join("\n");
}

export function toPierreDiffLineAnnotations(
  comments: DiffComment[],
  path: string,
  source?: WorkspaceToolPatchSource,
) {
  return comments
    .filter(
      (comment) =>
        comment.path === path &&
        (source === undefined || comment.source === source) &&
        comment.status !== "resolved",
    )
    .map((comment) => ({
      lineNumber: comment.lineNumber,
      metadata: { commentId: comment.id },
      side: comment.side,
    }));
}

export function projectIdFromWorkspaceToolContextKey(
  contextKey: string | null | undefined,
): string | undefined {
  if (!contextKey?.startsWith("project:")) {
    return undefined;
  }
  const rest = contextKey.slice("project:".length);
  const rootMarker = ":root:";
  const index = rest.indexOf(rootMarker);
  if (index <= 0) {
    return undefined;
  }
  return rest.slice(0, index);
}

export function chatIdFromWorkspaceToolContextKey(
  contextKey: string | null | undefined,
): string | undefined {
  if (!contextKey?.startsWith("chat:")) {
    return undefined;
  }
  const chatId = contextKey.slice("chat:".length);
  return chatId.length > 0 ? chatId : undefined;
}

function createDiffCommentId() {
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `diff-comment-${id}`;
}
