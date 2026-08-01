import type { FileDiffMetadata } from "@pierre/diffs";
import type { WorkspaceToolCssVariableStyle } from "@/app/workspace/workspace-tool-layout";

import type {
  WorkspaceToolPatchFile,
  WorkspaceToolPatchFileLineChanges,
} from "@/app/workspace/workspace-tool-patch-model";
import {
  DEFAULT_VIRTUAL_FILE_METRICS,
  getFiletypeFromFileName,
  getHighlighterOptions,
  preloadHighlighter,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";

import { useQuery } from "@tanstack/react-query";
import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import {
  formatWorkspaceToolPatchSource,
  workspaceToolFileDiffKey,
  workspaceToolFileDiffVersion,
} from "@/app/workspace/workspace-tool-patch-model";
import { cn } from "@/platform/utils";

const diffOptions = {
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
            preloadKey={workspaceToolFileDiffKey(
              diff.source,
              diff.fileDiff,
              index,
            )}
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
  preloadKey,
}: {
  fileDiff: FileDiffMetadata;
  preloadKey: string;
}) {
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

  if (!preloadQuery.data && !preloadQuery.isError) {
    return null;
  }

  if (preloadQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(preloadQuery.error)}
        title="Diff unavailable"
      />
    );
  }

  return (
    <FileDiff
      className="block overflow-hidden rounded-[inherit] bg-background"
      disableWorkerPool
      fileDiff={fileDiff}
      key={preloadKey}
      metrics={diffMetrics}
      options={diffOptions}
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
      await preloadHighlighter(getHighlighterOptions(language, diffOptions));
    }),
  );

  return true;
}
