import type {
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import type { WorkspaceToolCssVariableStyle } from "@/app/workspace/workspace-tool-layout";
import type {
  WorkspaceToolPatchFile,
  WorkspaceToolPatchFileLineChanges,
  WorkspaceToolPatchSource,
} from "@/app/workspace/workspace-tool-patch-model";

import {
  DEFAULT_VIRTUAL_FILE_METRICS,
  getFiletypeFromFileName,
  getHighlighterOptions,
  preloadHighlighter,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import {
  getDiffLineSnippet,
  toPierreDiffLineAnnotations,
} from "@/app/workspace/workspace-diff-comments";
import { useWorkspaceDiffCommentStore } from "@/app/workspace/workspace-diff-comment-store";
import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import {
  formatWorkspaceToolPatchSource,
  workspaceToolFileDiffKey,
  workspaceToolFileDiffVersion,
} from "@/app/workspace/workspace-tool-patch-model";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { cn } from "@/platform/utils";

const baseDiffOptions = {
  disableFileHeader: true,
  diffIndicators: "bars",
  diffStyle: "unified",
  hunkSeparators: "line-info-basic",
  overflow: "wrap",
  stickyHeader: true,
  theme: {
    dark: "vitesse-dark",
    light: "vitesse-light",
  },
  themeType: "system",
} as const;

const diffMetrics = {
  ...DEFAULT_VIRTUAL_FILE_METRICS,
  paddingTop: 0,
  paddingBottom: 0,
} as const;

/**
 * `@pierre/diffs` renders into a shadow root, so its custom properties are the
 * only styling surface. Added/removed line grounds are pinned to the
 * `--status-*-soft` tokens instead of the vendor's own colour mix: the vendor
 * blends the status hue into the page at 12-20%, which on a 1000-line diff
 * turns the whole screen into two washes of colour. The soft tokens sit under
 * 12%, so the bars and the line-number colours carry the signal and the code
 * stays readable.
 */
const diffHostStyle: WorkspaceToolCssVariableStyle = {
  // Zeroes the shadow-DOM [data-code] padding-block (vendor fallback 8px);
  // custom properties are the supported way through the shadow root.
  "--diffs-gap-block": "0px",
  "--diffs-addition-color-override": "var(--status-success)",
  "--diffs-bg-addition-number-override": "var(--status-success-soft)",
  "--diffs-bg-addition-override": "var(--status-success-soft)",
  "--diffs-bg-buffer-override": "var(--muted)",
  "--diffs-bg-context-gutter-override": "var(--background)",
  "--diffs-bg-context-override": "var(--background)",
  "--diffs-bg-deletion-number-override": "var(--status-danger-soft)",
  "--diffs-bg-deletion-override": "var(--status-danger-soft)",
  "--diffs-bg-hover-override": "var(--overlay-hover)",
  "--diffs-bg-separator-override": "var(--border-subtle)",
  "--diffs-dark": "var(--foreground)",
  "--diffs-dark-bg": "var(--background)",
  "--diffs-deletion-color-override": "var(--status-danger)",
  "--diffs-fg-number-addition-override": "var(--status-success)",
  "--diffs-fg-number-deletion-override": "var(--status-danger)",
  "--diffs-fg-number-override": "var(--muted-foreground)",
  "--diffs-font-family": "var(--font-mono)",
  // Lining figures keep the gutter from jittering as line counts cross a
  // digit boundary.
  "--diffs-font-features": '"tnum" 1, "calt" 0',
  "--diffs-light": "var(--foreground)",
  "--diffs-light-bg": "var(--background)",
} as const;

interface DiffCommentAnnotationMetadata {
  commentId: string;
}

export function WorkspaceToolPatchFileDiffContent({
  file,
  rounded = false,
}: {
  file: WorkspaceToolPatchFile;
  rounded?: boolean;
}) {
  if (file.previewNotice) {
    return (
      <div
        className="
          flex min-h-24 items-center justify-center px-4 py-6 text-center
          text-xs text-muted-foreground select-text
        "
      >
        {file.previewNotice}
      </div>
    );
  }

  return (
    <div className={cn(rounded && "overflow-hidden rounded-b-md")}>
      {file.diffs.map((diff, index) => (
        <div
          className={cn(
            "overflow-hidden",
            rounded &&
              `
                last:rounded-b-md
                [&:last-child_diffs-container]:rounded-b-md
              `,
          )}
          key={workspaceToolFileDiffKey(diff.source, diff.fileDiff, index)}
        >
          {file.diffs.length > 1 ? (
            <div
              className="
                border-b border-border-subtle px-2.5 py-1 font-mono text-[11px]
                font-medium text-muted-foreground
              "
            >
              {formatWorkspaceToolPatchSource(diff.source)}
            </div>
          ) : null}
          <WorkspaceToolFileDiff
            fileDiff={diff.fileDiff}
            path={file.name}
            preloadKey={workspaceToolFileDiffKey(
              diff.source,
              diff.fileDiff,
              index,
            )}
            source={diff.source}
          />
        </div>
      ))}
    </div>
  );
}

export function WorkspaceToolPatchFileLineStats({
  lineChanges,
}: {
  lineChanges: WorkspaceToolPatchFileLineChanges;
}) {
  if (lineChanges.additions === 0 && lineChanges.deletions === 0) {
    return null;
  }

  return (
    <span
      className="
        flex shrink-0 items-center gap-2 font-mono text-[11px] tabular-nums
      "
    >
      {lineChanges.additions > 0 ? (
        <span className="font-medium text-status-success">
          +{lineChanges.additions.toLocaleString()}
        </span>
      ) : null}
      {lineChanges.deletions > 0 ? (
        <span className="font-medium text-status-danger">
          −{lineChanges.deletions.toLocaleString()}
        </span>
      ) : null}
    </span>
  );
}

function WorkspaceToolFileDiff({
  fileDiff,
  path,
  preloadKey,
  source,
}: {
  fileDiff: FileDiffMetadata;
  path: string;
  preloadKey: string;
  source: WorkspaceToolPatchSource;
}) {
  const { t } = useTranslation();
  const { root } = useWorkspaceToolSurface();
  const comments = useWorkspaceDiffCommentStore((state) => state.comments);
  const addComment = useWorkspaceDiffCommentStore((state) => state.addComment);
  const setBody = useWorkspaceDiffCommentStore((state) => state.setBody);
  const deleteComment = useWorkspaceDiffCommentStore(
    (state) => state.deleteComment,
  );

  const preloadQuery = useQuery({
    queryFn: async () => preloadWorkspaceToolFileDiffHighlighter(fileDiff),
    queryKey: [
      "workspace-tool-file-diff-highlighter",
      preloadKey,
      workspaceToolFileDiffVersion(fileDiff),
    ],
    retry: false,
    staleTime: Infinity,
  });

  const lineAnnotations = useMemo(
    () => toPierreDiffLineAnnotations(comments, path, source),
    [comments, path, source],
  );

  const commentsById = useMemo(() => {
    const map = new Map(
      comments
        .filter((comment) => comment.path === path && comment.source === source)
        .map((comment) => [comment.id, comment] as const),
    );
    return map;
  }, [comments, path, source]);

  const handleGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      if (!is.nonEmptyString(root)) {
        return;
      }
      const lineNumber = range.start;
      const side = range.side === "deletions" ? "deletions" : "additions";
      const existing = comments.find(
        (comment) =>
          comment.root === root &&
          comment.path === path &&
          comment.source === source &&
          comment.side === side &&
          comment.lineNumber === lineNumber &&
          comment.status !== "resolved",
      );
      if (existing) {
        return;
      }
      addComment({
        lineNumber,
        path,
        root,
        side,
        snippet: getDiffLineSnippet(fileDiff, side, lineNumber),
        source,
      });
    },
    [addComment, comments, fileDiff, path, root, source],
  );

  const diffOptions = useMemo(
    () => ({
      ...baseDiffOptions,
      enableGutterUtility: is.nonEmptyString(root),
      onGutterUtilityClick: handleGutterUtilityClick,
    }),
    [handleGutterUtilityClick, root],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<DiffCommentAnnotationMetadata>) => {
      const commentId = annotation.metadata?.commentId;
      const comment = is.nonEmptyString(commentId)
        ? commentsById.get(commentId)
        : undefined;
      if (!comment) {
        return null;
      }

      return (
        <div
          className="
            border-y border-border-subtle bg-card px-2.5 py-2 text-xs
            text-foreground
          "
        >
          <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {t("workspace.tools.comments.lineComment", {
                line: comment.lineNumber,
              })}
            </span>
            <button
              className="
                ml-auto text-muted-foreground
                hover:text-foreground
              "
              type="button"
              onClick={() => deleteComment(comment.id)}
            >
              {t("workspace.tools.comments.delete")}
            </button>
          </div>
          {is.nonEmptyString(comment.snippet) ? (
            <div className="mb-1 truncate font-mono text-[11px] text-muted-foreground">
              {comment.snippet}
            </div>
          ) : null}
          <textarea
            aria-label={t("workspace.tools.comments.placeholder")}
            className="
              min-h-12 w-full resize-none rounded-md border border-input
              bg-background px-2 py-1.5 font-sans text-xs text-foreground
              outline-none
              focus-visible:border-primary focus-visible:ring-2
              focus-visible:ring-ring/45
            "
            placeholder={t("workspace.tools.comments.placeholder")}
            value={comment.body}
            onChange={(event) => setBody(comment.id, event.target.value)}
          />
        </div>
      );
    },
    [commentsById, deleteComment, setBody, t],
  );

  if (!preloadQuery.data && !preloadQuery.isError) {
    return null;
  }

  if (preloadQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(preloadQuery.error)}
        title={t("workspace.tools.diffUnavailable")}
      />
    );
  }

  return (
    <FileDiff<DiffCommentAnnotationMetadata>
      className="block overflow-hidden rounded-[inherit] bg-background"
      disableWorkerPool
      fileDiff={fileDiff}
      key={preloadKey}
      lineAnnotations={lineAnnotations}
      metrics={diffMetrics}
      options={diffOptions}
      renderAnnotation={renderAnnotation}
      style={diffHostStyle}
    />
  );
}

async function preloadWorkspaceToolFileDiffHighlighter(
  fileDiff: FileDiffMetadata,
) {
  const names = [fileDiff.name, fileDiff.prevName].flatMap((name) =>
    name == null ? [] : [name],
  );
  const languages = new Set(
    names.map((name) => fileDiff.lang ?? getFiletypeFromFileName(name)),
  );

  await Promise.all(
    [...languages].map(async (language) => {
      await preloadHighlighter(
        getHighlighterOptions(language, baseDiffOptions),
      );
    }),
  );

  return true;
}
