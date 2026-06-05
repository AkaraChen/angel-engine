import type { ApiClient } from "@/platform/api-client";
import type { WorkspaceRightSidebarTab } from "@/app/workspace/workspace-ui-store";
import type { TerminalSessionController } from "@shared/terminal";
import type { WorkspaceToolGitStatus } from "@shared/workspace-tools";
import type { ITheme } from "@xterm/xterm";

import { parsePatchFiles, type FileDiffMetadata } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { prepareFileTreeInput, type GitStatus } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  RiArrowLeftLine as ArrowLeft,
  RiArrowRightLine as ArrowRight,
  RiArrowDownSLine as ChevronDown,
  RiFolderLine as Folder,
  RiGitBranchLine as GitBranch,
  RiGlobalLine as Browser,
  RiRefreshLine as Refresh,
  RiTerminalBoxLine as TerminalIcon,
} from "@remixicon/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import "@xterm/xterm/css/xterm.css";

import {
  clampWorkspaceRightSidebarWidth,
  useWorkspaceUiStore,
} from "@/app/workspace/workspace-ui-store";
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

const pierreTerminalThemes = {
  dark: {
    black: "#171717",
    blue: "#009fff",
    brightBlack: "#171717",
    brightBlue: "#009fff",
    brightCyan: "#08c0ef",
    brightGreen: "#86c427",
    brightMagenta: "#e130ac",
    brightRed: "#ff2e3f",
    brightWhite: "#bcbcbc",
    brightYellow: "#ffca00",
    cursor: "#69b1ff",
    cyan: "#08c0ef",
    foreground: "#8a8a8a",
    green: "#0dbe4e",
    magenta: "#e130ac",
    red: "#ff2e3f",
    selectionBackground: "#1f3e5e",
    white: "#bcbcbc",
    yellow: "#ffca00",
  },
  light: {
    black: "#1d1d1d",
    blue: "#009fff",
    brightBlack: "#1d1d1d",
    brightBlue: "#009fff",
    brightCyan: "#08c0ef",
    brightGreen: "#86c427",
    brightMagenta: "#e130ac",
    brightRed: "#ff2e3f",
    brightWhite: "#bcbcbc",
    brightYellow: "#ffca00",
    cursor: "#009fff",
    cyan: "#08c0ef",
    foreground: "#737373",
    green: "#0dbe4e",
    magenta: "#e130ac",
    red: "#ff2e3f",
    selectionBackground: "#dfebff",
    white: "#bcbcbc",
    yellow: "#ffca00",
  },
} satisfies Record<"dark" | "light", ITheme>;

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
                onClick={() => onTabChange(tab.value)}
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
          root={root}
        />
      </div>
    </aside>
  );
}

function WorkspaceRightSidebarPanel({
  activeTab,
  api,
  root,
}: {
  activeTab: WorkspaceRightSidebarTab;
  api: ApiClient;
  root?: string;
}) {
  return (
    <div
      aria-labelledby={rightSidebarTabId(activeTab)}
      className="min-h-0 flex-1 overflow-hidden"
      id={rightSidebarPanelId(activeTab)}
      role="tabpanel"
      tabIndex={0}
    >
      {activeTab === "files" ? (
        <WorkspaceFilesPanel api={api} root={root} />
      ) : null}
      {activeTab === "terminal" ? <WorkspaceTerminalPanel root={root} /> : null}
      {activeTab === "git" ? <WorkspaceGitPanel api={api} root={root} /> : null}
      {activeTab === "browser" ? <WorkspaceBrowserPanel /> : null}
    </div>
  );
}

function WorkspaceFilesPanel({ api, root }: { api: ApiClient; root?: string }) {
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
      <div className="min-h-0 flex-1 overflow-hidden">
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        {data.warnings.length > 0 ? (
          <div className="space-y-1 rounded-md border border-border/70 bg-muted/30 p-2 text-xs text-muted-foreground">
            {data.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
        <WorkspacePatchFileList patchList={patchList} />
      </div>
    </div>
  );
}

function WorkspacePatchFileList({
  patchList,
}: {
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
          <WorkspacePatchFileItem file={file} key={file.key} />
        ))
      ) : patchList.errors.length === 0 ? (
        <div className="rounded-md border border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
          No changes
        </div>
      ) : null}
    </section>
  );
}

function WorkspacePatchFileItem({ file }: { file: WorkspacePatchFile }) {
  const fileName = formatWorkspacePatchFileName(file);

  return (
    <Collapsible
      className="overflow-hidden rounded-md border border-border/70 bg-background"
      defaultOpen
    >
      <CollapsibleTrigger
        className="
          group flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left
          text-xs transition-colors
          hover:bg-muted/50
        "
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
          {formatWorkspacePatchSourceSummary(file.diffs)}
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

function workspaceFileDiffKey(
  source: WorkspacePatchSource,
  fileDiff: FileDiffMetadata,
  index: number,
) {
  return `${source}:${index}:${fileDiff.cacheKey ?? fileDiff.prevName ?? ""}:${fileDiff.name}`;
}

function WorkspaceBrowserPanel() {
  const browserUrl = useWorkspaceUiStore((state) => state.browserUrl);
  const setBrowserUrl = useWorkspaceUiStore((state) => state.setBrowserUrl);
  const webviewRef = useRef<ElectronWebviewElement | null>(null);
  const [draftUrl, setDraftUrl] = useState(browserUrl);

  useEffect(() => {
    setDraftUrl(browserUrl);
  }, [browserUrl]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextUrl = normalizeBrowserUrl(draftUrl);
      setDraftUrl(nextUrl);
      setBrowserUrl(nextUrl);
    },
    [draftUrl, setBrowserUrl],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-2"
        onSubmit={handleSubmit}
      >
        <Button
          aria-label="Back"
          disabled={!webviewRef.current?.canGoBack()}
          onClick={() => webviewRef.current?.goBack()}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Forward"
          disabled={!webviewRef.current?.canGoForward()}
          onClick={() => webviewRef.current?.goForward()}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label="Reload"
          onClick={() => webviewRef.current?.reload()}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Refresh />
        </Button>
        <Input
          aria-label="URL"
          className="h-7 rounded-md px-2 text-xs"
          onChange={(event) => setDraftUrl(event.currentTarget.value)}
          value={draftUrl}
        />
      </form>
      <webview
        className="min-h-0 flex-1 bg-background"
        partition="persist:workspace-browser"
        ref={webviewRef}
        src={browserUrl}
      />
    </div>
  );
}

function WorkspaceTerminalPanel({ root }: { root?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !root) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      scrollback: 5000,
      theme: getWorkspaceTerminalTheme(),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(container);
    fitAddon.fit();
    const themeObserver = new MutationObserver(() => {
      terminal.options.theme = getWorkspaceTerminalTheme();
    });
    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    const controller = window.terminal.create(
      {
        cols: terminal.cols,
        cwd: root,
        rows: terminal.rows,
      },
      (event) => {
        if (event.type === "data") {
          terminal.write(event.data);
          return;
        }
        if (event.type === "error") {
          terminal.writeln(`\r\n${event.message}`);
          return;
        }
        terminal.writeln("\r\nProcess exited.");
      },
    );
    const dataDisposable = terminal.onData((data) => controller.write(data));
    const resizeObserver = new ResizeObserver(() => {
      fitTerminal(fitAddon, terminal, controller);
    });
    resizeObserver.observe(container);
    const animationFrame = window.requestAnimationFrame(() => {
      fitTerminal(fitAddon, terminal, controller);
      terminal.focus();
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
      themeObserver.disconnect();
      resizeObserver.disconnect();
      dataDisposable.dispose();
      controller.dispose();
      terminal.dispose();
    };
  }, [root]);

  if (!root) {
    return <WorkspaceToolEmpty title="No workspace root" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden bg-background p-2">
        <div ref={containerRef} className="h-full min-h-0 overflow-hidden" />
      </div>
    </div>
  );
}

function getWorkspaceTerminalTheme() {
  return {
    ...(document.documentElement.classList.contains("dark")
      ? pierreTerminalThemes.dark
      : pierreTerminalThemes.light),
    background: getWorkspaceBackgroundColor(),
  };
}

function getWorkspaceBackgroundColor() {
  return (
    getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim() || "transparent"
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

function fitTerminal(
  fitAddon: FitAddon,
  terminal: Terminal,
  controller: TerminalSessionController,
) {
  fitAddon.fit();
  controller.resize({
    cols: terminal.cols,
    rows: terminal.rows,
  });
}

function normalizeBrowserUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return "about:blank";
  if (trimmed === "about:blank") return trimmed;
  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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
