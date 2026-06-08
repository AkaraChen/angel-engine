import type { ApiClient } from "@/platform/api-client";
import type { WorkspaceRightSidebarTab } from "@/app/workspace/workspace-ui-store";
import type { WorkspaceBrowserState } from "@shared/workspace-browser";
import type { WorkspaceToolGitStatus } from "@shared/workspace-tools";

import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { prepareFileTreeInput, type GitStatus } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  RiAddLine as Add,
  RiArrowLeftLine as ArrowLeft,
  RiArrowRightLine as ArrowRight,
  RiArrowDownSLine as ChevronDown,
  RiCloseLine as Close,
  RiFolderLine as Folder,
  RiGitBranchLine as GitBranch,
  RiGlobalLine as Browser,
  RiRefreshLine as Refresh,
  RiExternalLinkLine as ExternalLink,
  RiTerminalBoxLine as TerminalIcon,
} from "@remixicon/react";
import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  clampWorkspaceRightSidebarWidth,
  useWorkspaceUiStore,
} from "@/app/workspace/workspace-ui-store";
import {
  WorkspaceBrowserNativeView,
  normalizeWorkspaceBrowserUrl,
} from "@/app/workspace/workspace-browser-view";
import { WorkspaceTerminalView } from "@/app/workspace/workspace-terminal-view";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";
import { useQuery } from "@tanstack/react-query";

const rightSidebarTabs: Array<{
  icon: typeof Folder;
  label: string;
  value: WorkspaceRightSidebarTab;
}> = [
  { icon: Folder, label: "File tree", value: "files" },
  { icon: TerminalIcon, label: "Terminal", value: "terminal" },
  { icon: GitBranch, label: "Version control", value: "git" },
  { icon: Browser, label: "Browser", value: "browser" },
];

type WorkspaceCssVariableStyle = CSSProperties &
  Record<`--${string}`, string | number>;

const largeWorkspaceDiffLineThreshold = 1000;
const defaultWorkspaceBrowserUrl = "about:blank";

const diffOptions = {
  disableFileHeader: true,
  diffIndicators: "bars",
  diffStyle: "unified",
  hunkSeparators: "line-info-basic",
  overflow: "wrap",
  stickyHeader: true,
  theme: {
    dark: "pierre-dark-soft",
    light: "pierre-light-soft",
  },
  themeType: "system",
} as const;

const treeHostStyle: WorkspaceCssVariableStyle = {
  "--trees-bg-muted-override": "var(--muted)",
  "--trees-bg-override": "var(--background)",
  "--trees-gap-override": "6px",
  "--trees-input-bg-override": "var(--background)",
  "--trees-item-margin-x-override": "0px",
  "--trees-item-padding-x-override": "6px",
  "--trees-item-row-gap-override": "4px",
  "--trees-level-gap-override": "8px",
  "--trees-padding-inline-override": "8px",
  height: "100%",
  minHeight: 0,
};

const diffHostStyle: WorkspaceCssVariableStyle = {
  "--diffs-bg-buffer-override": "var(--muted)",
  "--diffs-bg-context-gutter-override": "var(--background)",
  "--diffs-bg-context-override": "var(--background)",
  "--diffs-bg-separator-override": "var(--muted)",
  "--diffs-dark": "var(--foreground)",
  "--diffs-dark-bg": "var(--background)",
  "--diffs-light": "var(--foreground)",
  "--diffs-light-bg": "var(--background)",
};

interface WorkspaceRightSidebarProps {
  activeTab: WorkspaceRightSidebarTab;
  api: ApiClient;
  open: boolean;
  root?: string;
  width: number;
  onTabChange: (tab: WorkspaceRightSidebarTab) => void;
  onWidthChange: (width: number) => void;
}

type WorkspacePatchSource = "staged" | "unstaged";

interface WorkspaceFilePatch {
  fileDiff: FileDiffMetadata;
  source: WorkspacePatchSource;
}

interface WorkspacePatchFile {
  diffs: WorkspaceFilePatch[];
  key: string;
  name: string;
  prevName?: string;
}

interface WorkspaceTerminalTab {
  id: string;
  title: string;
}

interface WorkspaceTerminalTabsState {
  activeTabId: string;
  nextOrdinal: number;
  tabs: WorkspaceTerminalTab[];
}

interface WorkspaceBrowserTab {
  browserViewId: string;
  draftUrl: string;
  id: string;
  title: string;
  url: string;
}

interface WorkspaceBrowserTabsState {
  activeTabId: string;
  nextOrdinal: number;
  tabs: WorkspaceBrowserTab[];
}

function createWorkspaceTerminalTab(ordinal: number): WorkspaceTerminalTab {
  return {
    id: crypto.randomUUID(),
    title: `Terminal ${ordinal}`,
  };
}

function createWorkspaceTerminalTabsState(): WorkspaceTerminalTabsState {
  const firstTab = createWorkspaceTerminalTab(1);

  return {
    activeTabId: firstTab.id,
    nextOrdinal: 2,
    tabs: [firstTab],
  };
}

function createWorkspaceBrowserTab(
  ordinal: number,
  url = defaultWorkspaceBrowserUrl,
): WorkspaceBrowserTab {
  return {
    browserViewId: crypto.randomUUID(),
    draftUrl: url,
    id: crypto.randomUUID(),
    title: `Browser ${ordinal}`,
    url,
  };
}

function createWorkspaceBrowserTabsState(
  url: string,
): WorkspaceBrowserTabsState {
  const firstTab = createWorkspaceBrowserTab(1, url);

  return {
    activeTabId: firstTab.id,
    nextOrdinal: 2,
    tabs: [firstTab],
  };
}

export function WorkspaceRightSidebar({
  activeTab,
  api,
  open,
  root,
  width,
  onTabChange,
  onWidthChange,
}: WorkspaceRightSidebarProps) {
  const resizeStateRef = useRef<{ startWidth: number; startX: number } | null>(
    null,
  );
  const [draftWidth, setDraftWidth] = useState(width);
  const [resizing, setResizing] = useState(false);
  const [terminalMounted, setTerminalMounted] = useState(
    activeTab === "terminal",
  );
  const [browserMounted, setBrowserMounted] = useState(activeTab === "browser");
  const widthStyle = { width: open ? draftWidth : 0 };
  const contentStyle = { width: draftWidth };

  useEffect(() => {
    if (!resizeStateRef.current) {
      setDraftWidth(width);
    }
  }, [width]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const nextDraftWidth = clampWorkspaceRightSidebarWidth(draftWidth);
      setDraftWidth(nextDraftWidth);
      resizeStateRef.current = {
        startWidth: nextDraftWidth,
        startX: event.clientX,
      };
      setResizing(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [draftWidth],
  );
  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      setDraftWidth(
        clampWorkspaceRightSidebarWidth(
          resizeState.startWidth + resizeState.startX - event.clientX,
        ),
      );
    },
    [],
  );
  const handleResizePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (resizeState) {
        const nextWidth = clampWorkspaceRightSidebarWidth(
          resizeState.startWidth + resizeState.startX - event.clientX,
        );
        setDraftWidth(nextWidth);
        onWidthChange(nextWidth);
      }
      resizeStateRef.current = null;
      setResizing(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [onWidthChange],
  );
  const handleTabChange = useCallback(
    (tab: WorkspaceRightSidebarTab) => {
      if (tab === "terminal") {
        setTerminalMounted(true);
      }
      if (tab === "browser") {
        setBrowserMounted(true);
      }
      onTabChange(tab);
    },
    [onTabChange],
  );

  return (
    <aside
      aria-hidden={!open}
      inert={!open ? true : undefined}
      className={cn(
        `
          relative min-h-0 shrink-0 overflow-hidden border-l border-foreground/10
          bg-background/80
          dark:border-white/10
        `,
        resizing
          ? "transition-opacity"
          : "transition-[width,opacity] duration-200 ease-linear",
        open ? "opacity-100" : "opacity-0",
      )}
      style={widthStyle}
    >
      <div
        aria-hidden="true"
        className="
          absolute inset-y-0 left-0 z-10 w-2 -translate-x-1/2 cursor-col-resize
          touch-none
          before:absolute before:inset-y-0 before:left-1/2 before:w-px
          before:-translate-x-1/2 before:bg-transparent
          hover:before:bg-primary/35
        "
        onPointerCancel={handleResizePointerEnd}
        onPointerDown={handleResizePointerDown}
        onPointerMove={handleResizePointerMove}
        onPointerUp={handleResizePointerEnd}
      />
      <div className="flex h-full flex-col" style={contentStyle}>
        <div
          aria-label="Workspace tools"
          className="
            flex h-11 shrink-0 items-center gap-1 border-b border-foreground/10
            px-2
            dark:border-white/10
          "
          role="tablist"
        >
          {rightSidebarTabs.map((tab) => {
            const active = activeTab === tab.value;
            const Icon = tab.icon;
            const tabId = rightSidebarTabId(tab.value);
            const panelId = rightSidebarPanelId(tab.value);

            return (
              <Button
                aria-controls={panelId}
                aria-label={tab.label}
                aria-selected={active}
                className={cn(
                  `
                    text-muted-foreground
                    hover:text-foreground
                  `,
                  active &&
                    `
                      bg-muted text-foreground
                      hover:bg-muted hover:text-foreground
                    `,
                )}
                id={tabId}
                key={tab.value}
                onClick={() => handleTabChange(tab.value)}
                role="tab"
                size="icon-sm"
                title={tab.label}
                type="button"
                variant="ghost"
              >
                <Icon />
              </Button>
            );
          })}
        </div>
        <WorkspaceRightSidebarPanel
          activeTab={activeTab}
          api={api}
          browserMounted={browserMounted}
          root={root}
          terminalMounted={terminalMounted}
        />
      </div>
    </aside>
  );
}

function WorkspaceRightSidebarPanel({
  activeTab,
  api,
  browserMounted,
  root,
  terminalMounted,
}: {
  activeTab: WorkspaceRightSidebarTab;
  api: ApiClient;
  browserMounted: boolean;
  root?: string;
  terminalMounted: boolean;
}) {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <WorkspaceRightSidebarPanelShell
        active={activeTab === "files"}
        tab="files"
      >
        {activeTab === "files" ? (
          <WorkspaceFilesPanel api={api} root={root} />
        ) : null}
      </WorkspaceRightSidebarPanelShell>
      <WorkspaceRightSidebarPanelShell
        active={activeTab === "terminal"}
        keepMounted
        tab="terminal"
      >
        {terminalMounted || activeTab === "terminal" ? (
          <WorkspaceTerminalPanel
            active={activeTab === "terminal"}
            key={root ?? "no-root"}
            root={root}
          />
        ) : null}
      </WorkspaceRightSidebarPanelShell>
      <WorkspaceRightSidebarPanelShell active={activeTab === "git"} tab="git">
        {activeTab === "git" ? (
          <WorkspaceGitPanel api={api} root={root} />
        ) : null}
      </WorkspaceRightSidebarPanelShell>
      <WorkspaceRightSidebarPanelShell
        active={activeTab === "browser"}
        keepMounted
        tab="browser"
      >
        {browserMounted || activeTab === "browser" ? (
          <WorkspaceBrowserPanel active={activeTab === "browser"} />
        ) : null}
      </WorkspaceRightSidebarPanelShell>
    </div>
  );
}

function WorkspaceRightSidebarPanelShell({
  active,
  children,
  keepMounted = false,
  tab,
}: {
  active: boolean;
  children: ReactNode;
  keepMounted?: boolean;
  tab: WorkspaceRightSidebarTab;
}) {
  return (
    <div
      aria-hidden={!active}
      aria-labelledby={rightSidebarTabId(tab)}
      className={cn(
        "absolute inset-0 min-h-0 overflow-hidden",
        !active && (keepMounted ? "pointer-events-none opacity-0" : "hidden"),
      )}
      hidden={!active && !keepMounted}
      id={rightSidebarPanelId(tab)}
      inert={!active ? true : undefined}
      role="tabpanel"
      tabIndex={active ? 0 : -1}
    >
      {children}
    </div>
  );
}

function WorkspaceFilesPanel({ api, root }: { api: ApiClient; root?: string }) {
  const openWorkspaceTool = useWorkspaceToolStore(
    (state) => state.openWorkspaceTool,
  );
  const { model } = useFileTree({
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    icons: { colored: true, set: "complete" },
    id: "workspace-file-tree",
    initialExpansion: 1,
    initialVisibleRowCount: 32,
    paths: [],
    search: false,
  });
  const treeQuery = useQuery({
    enabled: Boolean(root),
    queryFn: async () => {
      if (!root) {
        throw new Error("Workspace root is required.");
      }
      return api.workspaceTools.fileTree({ root });
    },
    queryKey: queryKeys.workspaceTools.fileTree(root ?? null),
    retry: false,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!treeQuery.data) return;

    const preparedInput = prepareFileTreeInput(treeQuery.data.paths, {
      flattenEmptyDirectories: true,
      sort: "default",
    });
    model.resetPaths(treeQuery.data.paths, { preparedInput });
    model.setGitStatus(
      treeQuery.data.gitStatus.map((entry) => ({
        path: entry.path,
        status: toTreeGitStatus(entry.status),
      })),
    );
  }, [model, treeQuery.data]);
  const handleFileTreeClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!root || !(event.target instanceof Element)) {
        return;
      }

      const row = event.target.closest<HTMLElement>(
        "[data-item-path][data-item-type='file']",
      );
      const path = row?.dataset.itemPath;
      if (!path) {
        return;
      }

      openWorkspaceTool(
        {
          kind: "file-preview",
          path,
          root,
          title: path,
        },
        "dialog",
      );
    },
    [openWorkspaceTool, root],
  );

  if (!root) {
    return <WorkspaceToolEmpty title="No workspace root" />;
  }

  if (treeQuery.isError) {
    return (
      <WorkspaceToolEmpty
        title="File tree unavailable"
        detail={getErrorMessage(treeQuery.error)}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {treeQuery.data?.truncated ? (
        <div className="shrink-0 px-3 py-2 text-xs text-muted-foreground">
          Limited result set
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-hidden"
        onClick={handleFileTreeClick}
      >
        {treeQuery.isLoading ? (
          <WorkspaceFileTreeSkeleton />
        ) : (
          <FileTree
            className="h-full min-h-0 bg-background text-sm"
            model={model}
            style={treeHostStyle}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceGitPanel({ api, root }: { api: ApiClient; root?: string }) {
  const openWorkspaceTool = useWorkspaceToolStore(
    (state) => state.openWorkspaceTool,
  );
  const closeWorkspaceTool = useWorkspaceToolStore(
    (state) => state.closeWorkspaceTool,
  );
  const gitQuery = useQuery({
    enabled: Boolean(root),
    queryFn: async () => {
      if (!root) {
        throw new Error("Workspace root is required.");
      }
      return api.workspaceTools.gitDiff({ root });
    },
    queryKey: queryKeys.workspaceTools.gitDiff(root ?? null),
    retry: false,
    staleTime: 5_000,
  });
  if (!root) {
    return <WorkspaceToolEmpty title="No workspace root" />;
  }

  if (gitQuery.isError) {
    return (
      <WorkspaceToolEmpty
        title="Git unavailable"
        detail={getErrorMessage(gitQuery.error)}
      />
    );
  }

  if (gitQuery.isLoading) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  const data = gitQuery.data;
  if (!data?.isGitRepository) {
    return <WorkspaceToolEmpty title="Not a Git repository" detail={root} />;
  }
  const patchList = buildWorkspacePatchList(
    data.stagedPatch,
    data.unstagedPatch,
  );
  const openDialogGitDiffTool = (
    input: Parameters<typeof openWorkspaceTool>[0],
  ) => {
    for (const instance of Object.values(
      useWorkspaceToolStore.getState().instances,
    )) {
      if (
        instance.host === "dialog" &&
        instance.kind === "git-diff" &&
        instance.root === root
      ) {
        closeWorkspaceTool(instance.id);
      }
    }

    openWorkspaceTool(input, "dialog");
  };
  const openGitDiffDialog = () => {
    if (!root) {
      return;
    }

    openDialogGitDiffTool({
      kind: "git-diff",
      root,
      title: data.branch ? `Git diff: ${data.branch}` : "Git diff",
    });
  };
  const openGitFileDialog = (file: WorkspacePatchFile) => {
    if (!root) {
      return;
    }

    openDialogGitDiffTool({
      kind: "git-diff",
      path: file.name,
      root,
      title: formatWorkspacePatchFileName(file),
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-end border-b border-border/70 px-2">
        <Button
          className="h-7 border-border/70 px-2 text-xs text-muted-foreground"
          onClick={openGitDiffDialog}
          size="xs"
          title="Open git diff"
          type="button"
          variant="outline"
        >
          <ExternalLink className="size-3.5" />
          <span>Open</span>
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {data.warnings.length > 0 ? (
          <div className="space-y-1 rounded-md border border-border/70 bg-muted/30 p-2 text-xs text-muted-foreground">
            {data.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
        <WorkspacePatchFileList
          patchList={patchList}
          onOpenFile={openGitFileDialog}
        />
      </div>
    </div>
  );
}

function WorkspacePatchFileList({
  onOpenFile,
  patchList,
}: {
  onOpenFile?: (file: WorkspacePatchFile) => void;
  patchList: {
    errors: string[];
    files: WorkspacePatchFile[];
  };
}) {
  return (
    <section className="space-y-2">
      {patchList.errors.map((error) => (
        <div
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          key={error}
        >
          {error}
        </div>
      ))}
      {patchList.files.length > 0 ? (
        patchList.files.map((file) => (
          <WorkspacePatchFileItem
            file={file}
            key={file.key}
            onOpenFile={onOpenFile}
          />
        ))
      ) : patchList.errors.length === 0 ? (
        <div className="rounded-md border border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
          No changes
        </div>
      ) : null}
    </section>
  );
}

function WorkspacePatchFileItem({
  file,
  onOpenFile,
}: {
  file: WorkspacePatchFile;
  onOpenFile?: (file: WorkspacePatchFile) => void;
}) {
  const fileName = formatWorkspacePatchFileName(file);
  const lineCount = getWorkspacePatchFileLineCount(file);

  return (
    <Collapsible
      className="overflow-hidden rounded-md border border-border/70 bg-background"
      defaultOpen={lineCount <= largeWorkspaceDiffLineThreshold}
    >
      <CollapsibleTrigger
        className="
          group flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left
          text-xs transition-colors
          hover:bg-muted/50
        "
        onClick={(event) => {
          if (!onOpenFile) {
            return;
          }
          event.preventDefault();
          onOpenFile(file);
        }}
        type="button"
      >
        <ChevronDown
          className="
            size-4 shrink-0 text-muted-foreground transition-transform
            group-data-[state=closed]:-rotate-90
          "
        />
        <span
          className="min-w-0 flex-1 truncate font-medium text-foreground"
          title={fileName}
        >
          {fileName}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatWorkspacePatchFileSummary(file.diffs, lineCount)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent
        className="
          overflow-hidden
          data-[state=closed]:animate-collapsible-up
          data-[state=open]:animate-collapsible-down
        "
      >
        <div className="space-y-2 border-t border-border/70">
          {file.diffs.map((diff, index) => (
            <div
              className="overflow-hidden"
              key={workspaceFileDiffKey(diff.source, diff.fileDiff, index)}
            >
              {file.diffs.length > 1 ? (
                <div className="border-b border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                  {formatWorkspacePatchSource(diff.source)}
                </div>
              ) : null}
              <FileDiff
                className="block overflow-hidden bg-background"
                disableWorkerPool
                fileDiff={diff.fileDiff}
                options={diffOptions}
                style={diffHostStyle}
              />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function buildWorkspacePatchList(stagedPatch: string, unstagedPatch: string) {
  const staged = parseWorkspacePatch(stagedPatch, "workspace-git-staged");
  const unstaged = parseWorkspacePatch(unstagedPatch, "workspace-git-unstaged");
  const files = groupWorkspacePatchFiles([
    ...staged.files.map((fileDiff) => ({
      fileDiff,
      source: "staged" as const,
    })),
    ...unstaged.files.map((fileDiff) => ({
      fileDiff,
      source: "unstaged" as const,
    })),
  ]);

  return {
    errors: [staged.error, unstaged.error].filter((error): error is string =>
      Boolean(error),
    ),
    files,
  };
}

function parseWorkspacePatch(
  patch: string,
  cacheKeyPrefix: string,
): {
  error?: string;
  files: FileDiffMetadata[];
} {
  const trimmedPatch = patch.trim();
  if (!trimmedPatch) {
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

function groupWorkspacePatchFiles(diffs: WorkspaceFilePatch[]) {
  const groups = new Map<string, WorkspacePatchFile>();

  for (const diff of diffs) {
    const key = workspacePatchFileKey(diff.fileDiff);
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
    formatWorkspacePatchFileName(a).localeCompare(
      formatWorkspacePatchFileName(b),
    ),
  );
}

function workspacePatchFileKey(fileDiff: FileDiffMetadata) {
  return fileDiff.name;
}

function formatWorkspacePatchFileName(file: {
  name: string;
  prevName?: string;
}) {
  return file.prevName ? `${file.prevName} -> ${file.name}` : file.name;
}

function formatWorkspacePatchSource(source: WorkspacePatchSource) {
  return source === "staged" ? "Staged" : "Unstaged";
}

function formatWorkspacePatchSourceSummary(diffs: WorkspaceFilePatch[]) {
  const sources = new Set(diffs.map((diff) => diff.source));

  if (sources.has("staged") && sources.has("unstaged")) {
    return "staged + unstaged";
  }
  return formatWorkspacePatchSource(
    diffs[0]?.source ?? "unstaged",
  ).toLowerCase();
}

function formatWorkspacePatchFileSummary(
  diffs: WorkspaceFilePatch[],
  lineCount: number,
) {
  return `${formatWorkspacePatchSourceSummary(diffs)} · ${lineCount.toLocaleString()} lines`;
}

function getWorkspacePatchFileLineCount(file: WorkspacePatchFile) {
  return file.diffs.reduce(
    (total, diff) => total + diff.fileDiff.unifiedLineCount,
    0,
  );
}

function workspaceFileDiffKey(
  source: WorkspacePatchSource,
  fileDiff: FileDiffMetadata,
  index: number,
) {
  return `${source}:${index}:${fileDiff.cacheKey ?? fileDiff.prevName ?? ""}:${fileDiff.name}`;
}

function WorkspaceBrowserPanel({ active }: { active: boolean }) {
  const browserUrl = useWorkspaceUiStore((state) => state.browserUrl);
  const setBrowserUrl = useWorkspaceUiStore((state) => state.setBrowserUrl);
  const openWorkspaceTool = useWorkspaceToolStore(
    (state) => state.openWorkspaceTool,
  );
  const [tabsState, setTabsState] = useState(() =>
    createWorkspaceBrowserTabsState(browserUrl),
  );
  const activeTab =
    tabsState.tabs.find((tab) => tab.id === tabsState.activeTabId) ??
    tabsState.tabs[0];
  const detachedBrowserTool = useWorkspaceToolStore((state) =>
    activeTab
      ? state.findBrowserToolByViewId(activeTab.browserViewId)
      : undefined,
  );
  const activeBrowserDetached =
    detachedBrowserTool !== undefined && detachedBrowserTool.host !== "sidebar";
  const [navigationState, setNavigationState] = useState<WorkspaceBrowserState>(
    {
      canGoBack: false,
      canGoForward: false,
      ready: false,
      title: activeTab.title,
      url: activeTab.url,
    },
  );
  const refreshNavigationState = useCallback((tab: WorkspaceBrowserTab) => {
    void window.workspaceBrowser
      .getState({ browserViewId: tab.browserViewId })
      .then(setNavigationState)
      .catch(() => {});
  }, []);
  const handleBrowserStateChange = useCallback(
    (tabId: string, state: WorkspaceBrowserState) => {
      setTabsState((current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                draftUrl: state.url || tab.draftUrl,
                title: state.title.trim() || browserTabTitle(tab, state.url),
                url: state.url || tab.url,
              }
            : tab,
        ),
      }));

      if (tabsState.activeTabId === tabId) {
        setBrowserUrl(state.url);
        setNavigationState(state);
      }
    },
    [setBrowserUrl, tabsState.activeTabId],
  );
  const updateActiveBrowserDraftUrl = useCallback((draftUrl: string) => {
    setTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, draftUrl } : tab,
      ),
    }));
  }, []);
  const addBrowserTab = useCallback(() => {
    setBrowserUrl(defaultWorkspaceBrowserUrl);
    setTabsState((current) => {
      const tab = createWorkspaceBrowserTab(current.nextOrdinal);
      setNavigationState({
        canGoBack: false,
        canGoForward: false,
        ready: false,
        title: tab.title,
        url: tab.url,
      });

      return {
        activeTabId: tab.id,
        nextOrdinal: current.nextOrdinal + 1,
        tabs: [...current.tabs, tab],
      };
    });
  }, [setBrowserUrl]);
  const selectBrowserTab = useCallback(
    (tabId: string) => {
      const tab = tabsState.tabs.find((candidate) => candidate.id === tabId);
      if (!tab || tabsState.activeTabId === tabId) {
        return;
      }

      setTabsState({ ...tabsState, activeTabId: tabId });
      setBrowserUrl(tab.url);
      setNavigationState({
        canGoBack: false,
        canGoForward: false,
        ready: false,
        title: tab.title,
        url: tab.url,
      });
      refreshNavigationState(tab);
    },
    [refreshNavigationState, setBrowserUrl, tabsState],
  );
  const closeBrowserTab = useCallback(
    (tabId: string) => {
      if (tabsState.tabs.length === 1) {
        return;
      }

      const tabIndex = tabsState.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) {
        return;
      }
      const tab = tabsState.tabs[tabIndex];
      const detachedTool = useWorkspaceToolStore
        .getState()
        .findBrowserToolByViewId(tab.browserViewId);
      if (detachedTool) {
        useWorkspaceToolStore.getState().closeWorkspaceTool(detachedTool.id);
      }
      void window.workspaceBrowser.destroy({
        browserViewId: tab.browserViewId,
      });

      const tabs = tabsState.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId =
        tabsState.activeTabId === tabId
          ? tabs[Math.min(tabIndex, tabs.length - 1)].id
          : tabsState.activeTabId;
      const nextActiveTab = tabs.find((tab) => tab.id === activeTabId);

      setTabsState({ ...tabsState, activeTabId, tabs });
      if (tabsState.activeTabId === tabId && nextActiveTab) {
        setBrowserUrl(nextActiveTab.url);
        setNavigationState({
          canGoBack: false,
          canGoForward: false,
          ready: false,
          title: nextActiveTab.title,
          url: nextActiveTab.url,
        });
        refreshNavigationState(nextActiveTab);
      }
    },
    [refreshNavigationState, setBrowserUrl, tabsState],
  );

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextUrl = normalizeWorkspaceBrowserUrl(activeTab.draftUrl);

      setTabsState((current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === current.activeTabId
            ? {
                ...tab,
                draftUrl: nextUrl,
                title: browserTabTitle(tab, nextUrl),
                url: nextUrl,
              }
            : tab,
        ),
      }));
      setBrowserUrl(nextUrl);
      setNavigationState((current) => ({
        ...current,
        title: browserTabTitle(activeTab, nextUrl),
        url: nextUrl,
      }));
      void window.workspaceBrowser
        .navigate({ browserViewId: activeTab.browserViewId, url: nextUrl })
        .then(setNavigationState)
        .catch(() => {});
    },
    [activeTab, setBrowserUrl],
  );
  const goBack = useCallback(() => {
    void window.workspaceBrowser
      .goBack({ browserViewId: activeTab.browserViewId })
      .then(setNavigationState)
      .catch(() => {});
  }, [activeTab.browserViewId]);
  const goForward = useCallback(() => {
    void window.workspaceBrowser
      .goForward({ browserViewId: activeTab.browserViewId })
      .then(setNavigationState)
      .catch(() => {});
  }, [activeTab.browserViewId]);
  const reload = useCallback(() => {
    void window.workspaceBrowser
      .reload({ browserViewId: activeTab.browserViewId })
      .then(setNavigationState)
      .catch(() => {});
  }, [activeTab.browserViewId]);
  const openActiveBrowserInDialog = useCallback(() => {
    openWorkspaceTool(
      {
        browserViewId: activeTab.browserViewId,
        kind: "browser",
        title: activeTab.title,
        url: activeTab.url,
      },
      "dialog",
    );
  }, [activeTab, openWorkspaceTool]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceBrowserTabStrip
        activeTabId={tabsState.activeTabId}
        tabs={tabsState.tabs}
        onAddTab={addBrowserTab}
        onCloseTab={closeBrowserTab}
        onSelectTab={selectBrowserTab}
      />
      <form
        className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-2"
        onSubmit={handleSubmit}
      >
        <Button
          aria-label="Back"
          disabled={activeBrowserDetached || !navigationState.canGoBack}
          onClick={goBack}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Forward"
          disabled={activeBrowserDetached || !navigationState.canGoForward}
          onClick={goForward}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label="Reload"
          disabled={activeBrowserDetached || !navigationState.ready}
          onClick={reload}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Refresh />
        </Button>
        <Input
          aria-label="URL"
          className="h-7 rounded-md px-2 text-xs"
          onChange={(event) =>
            updateActiveBrowserDraftUrl(event.currentTarget.value)
          }
          value={activeTab.draftUrl}
        />
        <Button
          aria-label="Open browser tab"
          disabled={activeBrowserDetached}
          onClick={openActiveBrowserInDialog}
          size="icon-xs"
          title="Open browser tab"
          type="button"
          variant="ghost"
        >
          <ExternalLink />
        </Button>
      </form>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        {tabsState.tabs.map((tab) => {
          const tabActive = active && tabsState.activeTabId === tab.id;
          const detachedTool =
            detachedBrowserTool?.kind === "browser" &&
            tab.browserViewId === detachedBrowserTool.browserViewId
              ? detachedBrowserTool
              : undefined;

          return (
            <div
              aria-hidden={!tabActive}
              aria-labelledby={workspaceBrowserTabId(tab.id)}
              className={cn(
                "absolute inset-0 min-h-0 overflow-hidden",
                !tabActive && "pointer-events-none opacity-0",
              )}
              id={workspaceBrowserTabPanelId(tab.id)}
              inert={!tabActive ? true : undefined}
              key={tab.id}
              role="tabpanel"
            >
              {detachedTool && detachedTool.host !== "sidebar" ? (
                <WorkspaceToolEmpty
                  detail={detachedTool.title}
                  title="Browser opened elsewhere"
                />
              ) : (
                <WorkspaceBrowserView
                  active={tabActive}
                  tab={tab}
                  onStateChange={handleBrowserStateChange}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkspaceBrowserTabStrip({
  activeTabId,
  tabs,
  onAddTab,
  onCloseTab,
  onSelectTab,
}: {
  activeTabId: string;
  tabs: WorkspaceBrowserTab[];
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSelectTab: (tabId: string) => void;
}) {
  return (
    <div
      aria-label="Browser tabs"
      className="
        flex h-9 shrink-0 items-center gap-1 border-b border-border/70 px-2
      "
      role="tablist"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = activeTabId === tab.id;

          return (
            <div
              className={cn(
                `
                  flex h-7 max-w-36 min-w-24 shrink-0 items-center overflow-hidden
                  rounded-md border border-transparent text-xs text-muted-foreground
                `,
                active
                  ? "border-border/80 bg-muted text-foreground"
                  : "hover:bg-muted/60 hover:text-foreground",
              )}
              key={tab.id}
            >
              <button
                aria-controls={workspaceBrowserTabPanelId(tab.id)}
                aria-selected={active}
                className="
                  flex h-full min-w-0 flex-1 items-center gap-1.5 px-2
                  text-left outline-none
                  focus-visible:ring-2 focus-visible:ring-ring/30
                "
                id={workspaceBrowserTabId(tab.id)}
                onClick={() => onSelectTab(tab.id)}
                role="tab"
                title={tab.title}
                type="button"
              >
                <Browser className="size-3.5 shrink-0" />
                <span className="truncate">{tab.title}</span>
              </button>
              {tabs.length > 1 ? (
                <button
                  aria-label={`Close ${tab.title}`}
                  className="
                    flex h-full w-6 shrink-0 items-center justify-center
                    text-muted-foreground/70 outline-none
                    hover:bg-foreground/5 hover:text-foreground
                    focus-visible:ring-2 focus-visible:ring-ring/30
                  "
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title={`Close ${tab.title}`}
                  type="button"
                >
                  <Close className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <Button
        aria-label="New browser tab"
        className="h-7 border-border/70 px-2 text-xs text-muted-foreground"
        onClick={onAddTab}
        size="xs"
        title="New browser tab"
        type="button"
        variant="outline"
      >
        <Add className="size-3.5" />
        <span>New</span>
      </Button>
    </div>
  );
}

function WorkspaceBrowserView({
  active,
  tab,
  onStateChange,
}: {
  active: boolean;
  tab: WorkspaceBrowserTab;
  onStateChange: (tabId: string, state: WorkspaceBrowserState) => void;
}) {
  const handleStateChange = useCallback(
    (state: WorkspaceBrowserState) => {
      onStateChange(tab.id, state);
    },
    [onStateChange, tab.id],
  );

  return (
    <WorkspaceBrowserNativeView
      active={active}
      browserViewId={tab.browserViewId}
      onStateChange={handleStateChange}
      url={tab.url}
    />
  );
}

function browserTabTitle(tab: WorkspaceBrowserTab, url: string) {
  const trimmedUrl = url.trim();

  if (!trimmedUrl || trimmedUrl === defaultWorkspaceBrowserUrl) {
    return tab.title.startsWith("Browser ") ? tab.title : "Blank";
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    return parsedUrl.host || parsedUrl.href;
  } catch {
    return trimmedUrl;
  }
}

function WorkspaceTerminalPanel({
  active,
  root,
}: {
  active: boolean;
  root?: string;
}) {
  const openWorkspaceTool = useWorkspaceToolStore(
    (state) => state.openWorkspaceTool,
  );
  const [tabsState, setTabsState] = useState(createWorkspaceTerminalTabsState);
  const activeTab =
    tabsState.tabs.find((tab) => tab.id === tabsState.activeTabId) ??
    tabsState.tabs[0];
  const detachedTerminalTool = useWorkspaceToolStore((state) =>
    activeTab ? state.findTerminalToolBySessionId(activeTab.id) : undefined,
  );
  const activeTerminalDetached =
    detachedTerminalTool !== undefined &&
    detachedTerminalTool.host !== "sidebar";
  const addTerminalTab = useCallback(() => {
    setTabsState((current) => {
      const tab = createWorkspaceTerminalTab(current.nextOrdinal);

      return {
        activeTabId: tab.id,
        nextOrdinal: current.nextOrdinal + 1,
        tabs: [...current.tabs, tab],
      };
    });
  }, []);
  const selectTerminalTab = useCallback((tabId: string) => {
    setTabsState((current) =>
      current.activeTabId === tabId
        ? current
        : { ...current, activeTabId: tabId },
    );
  }, []);
  const closeTerminalTab = useCallback((tabId: string) => {
    setTabsState((current) => {
      if (current.tabs.length === 1) {
        return current;
      }

      const tabIndex = current.tabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) {
        return current;
      }
      const tab = current.tabs[tabIndex];
      const detachedTool = useWorkspaceToolStore
        .getState()
        .findTerminalToolBySessionId(tab.id);
      if (detachedTool) {
        useWorkspaceToolStore.getState().closeWorkspaceTool(detachedTool.id);
      }
      window.terminal.kill({ sessionId: tab.id });

      const tabs = current.tabs.filter((tab) => tab.id !== tabId);
      const activeTabId =
        current.activeTabId === tabId
          ? tabs[Math.min(tabIndex, tabs.length - 1)].id
          : current.activeTabId;

      return { ...current, activeTabId, tabs };
    });
  }, []);
  const openActiveTerminalInDialog = useCallback(() => {
    if (!root) {
      return;
    }

    openWorkspaceTool(
      {
        kind: "terminal",
        root,
        sessionId: activeTab.id,
        title: activeTab.title,
      },
      "dialog",
    );
  }, [activeTab, openWorkspaceTool, root]);

  if (!root) {
    return <WorkspaceToolEmpty title="No workspace root" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspaceTerminalTabStrip
        activeTabId={tabsState.activeTabId}
        tabs={tabsState.tabs}
        onAddTab={addTerminalTab}
        onCloseTab={closeTerminalTab}
        onOpenActiveTab={
          activeTerminalDetached ? undefined : openActiveTerminalInDialog
        }
        onSelectTab={selectTerminalTab}
      />
      <div className="min-h-0 flex-1 overflow-hidden bg-background p-2">
        <div className="relative h-full min-h-0 overflow-hidden">
          {tabsState.tabs.map((tab) => {
            const tabActive = active && tabsState.activeTabId === tab.id;
            const detachedTool =
              detachedTerminalTool?.kind === "terminal" &&
              tab.id === detachedTerminalTool.sessionId
                ? detachedTerminalTool
                : undefined;

            return (
              <div
                aria-hidden={!tabActive}
                aria-labelledby={workspaceTerminalTabId(tab.id)}
                className={cn(
                  "absolute inset-0 min-h-0 overflow-hidden",
                  !tabActive && "pointer-events-none opacity-0",
                )}
                id={workspaceTerminalTabPanelId(tab.id)}
                inert={!tabActive ? true : undefined}
                key={tab.id}
                role="tabpanel"
              >
                {detachedTool && detachedTool.host !== "sidebar" ? (
                  <WorkspaceToolEmpty
                    detail={detachedTool.title}
                    title="Terminal opened elsewhere"
                  />
                ) : (
                  <WorkspaceTerminalView
                    autoFocus={tabActive}
                    root={root}
                    sessionId={tab.id}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WorkspaceTerminalTabStrip({
  activeTabId,
  tabs,
  onAddTab,
  onCloseTab,
  onOpenActiveTab,
  onSelectTab,
}: {
  activeTabId: string;
  tabs: WorkspaceTerminalTab[];
  onAddTab: () => void;
  onCloseTab: (tabId: string) => void;
  onOpenActiveTab?: () => void;
  onSelectTab: (tabId: string) => void;
}) {
  return (
    <div
      aria-label="Terminal tabs"
      className="
        flex h-9 shrink-0 items-center gap-1 border-b border-border/70 px-2
      "
      role="tablist"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = activeTabId === tab.id;

          return (
            <div
              className={cn(
                `
                  flex h-7 max-w-36 min-w-24 shrink-0 items-center overflow-hidden
                  rounded-md border border-transparent text-xs text-muted-foreground
                `,
                active
                  ? "border-border/80 bg-muted text-foreground"
                  : "hover:bg-muted/60 hover:text-foreground",
              )}
              key={tab.id}
            >
              <button
                aria-controls={workspaceTerminalTabPanelId(tab.id)}
                aria-selected={active}
                className="
                  flex h-full min-w-0 flex-1 items-center gap-1.5 px-2
                  text-left outline-none
                  focus-visible:ring-2 focus-visible:ring-ring/30
                "
                id={workspaceTerminalTabId(tab.id)}
                onClick={() => onSelectTab(tab.id)}
                role="tab"
                title={tab.title}
                type="button"
              >
                <TerminalIcon className="size-3.5 shrink-0" />
                <span className="truncate">{tab.title}</span>
              </button>
              {tabs.length > 1 ? (
                <button
                  aria-label={`Close ${tab.title}`}
                  className="
                    flex h-full w-6 shrink-0 items-center justify-center
                    text-muted-foreground/70 outline-none
                    hover:bg-foreground/5 hover:text-foreground
                    focus-visible:ring-2 focus-visible:ring-ring/30
                  "
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title={`Close ${tab.title}`}
                  type="button"
                >
                  <Close className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
      <Button
        aria-label="Open terminal tab"
        className="h-7 border-border/70 px-2 text-xs text-muted-foreground"
        disabled={!onOpenActiveTab}
        onClick={onOpenActiveTab}
        size="xs"
        title="Open terminal tab"
        type="button"
        variant="outline"
      >
        <ExternalLink className="size-3.5" />
      </Button>
      <Button
        aria-label="New terminal tab"
        className="h-7 border-border/70 px-2 text-xs text-muted-foreground"
        onClick={onAddTab}
        size="xs"
        title="New terminal tab"
        type="button"
        variant="outline"
      >
        <Add className="size-3.5" />
        <span>New</span>
      </Button>
    </div>
  );
}

function WorkspaceToolEmpty({
  detail,
  title,
}: {
  detail?: string;
  title: string;
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center p-4 text-center">
      <div className="max-w-52 space-y-1">
        <div className="text-sm font-medium">{title}</div>
        {detail ? (
          <div className="break-words text-xs text-muted-foreground">
            {detail}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WorkspaceFileTreeSkeleton() {
  return (
    <div className="space-y-2 p-2">
      <Skeleton className="h-6 w-11/12 rounded-md" />
      <Skeleton className="h-6 w-9/12 rounded-md" />
      <Skeleton className="h-6 w-10/12 rounded-md" />
      <Skeleton className="h-6 w-8/12 rounded-md" />
    </div>
  );
}

function toTreeGitStatus(status: WorkspaceToolGitStatus): GitStatus {
  return status;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function rightSidebarTabId(tab: WorkspaceRightSidebarTab) {
  return `workspace-right-sidebar-${tab}-tab`;
}

function rightSidebarPanelId(tab: WorkspaceRightSidebarTab) {
  return `workspace-right-sidebar-${tab}-panel`;
}

function workspaceBrowserTabId(tabId: string) {
  return `workspace-browser-${tabId}-tab`;
}

function workspaceBrowserTabPanelId(tabId: string) {
  return `workspace-browser-${tabId}-panel`;
}

function workspaceTerminalTabId(tabId: string) {
  return `workspace-terminal-${tabId}-tab`;
}

function workspaceTerminalTabPanelId(tabId: string) {
  return `workspace-terminal-${tabId}-panel`;
}
