import type { ApiClient } from "@/platform/api-client";
import type { WorkspaceBrowserState } from "@shared/workspace-browser";
import type {
  WorkspaceFileReadResult,
  WorkspaceGitDiffResult,
  WorkspaceToolGitStatus,
} from "@shared/workspace-tools";
import type {
  WorkspaceToolPinnedTabId,
  WorkspaceToolSurfaceFilePreviewTab,
  WorkspaceToolSurfaceGitDiffTab,
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { CSSProperties } from "react";

import {
  getFiletypeFromFileName,
  getHighlighterOptions,
  parsePatchFiles,
  preloadHighlighter,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { prepareFileTreeInput, type GitStatus } from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  RiAddLine as Add,
  RiArrowLeftLine as ArrowLeft,
  RiArrowRightLine as ArrowRight,
  RiCloseLine as Close,
  RiExternalLinkLine as DialogIcon,
  RiFileTextLine as FileText,
  RiFolderLine as Folder,
  RiGitBranchLine as GitBranch,
  RiGlobalLine as Browser,
  RiRefreshLine as Refresh,
  RiSidebarFoldLine as DockIcon,
  RiTerminalBoxLine as TerminalIcon,
  RiWindowLine as WindowIcon,
} from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import {
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  WorkspaceBrowserNativeView,
  browserTitleFromUrl,
  normalizeWorkspaceBrowserUrl,
} from "@/app/workspace/workspace-browser-view";
import {
  currentWorkspaceToolSnapshot,
  ensureWorkspaceToolSurfaceEvents,
  useWorkspaceToolStore,
  workspaceToolFilesTabId,
  workspaceToolGitTabId,
} from "@/app/workspace/workspace-tool-store";
import { WorkspaceTerminalView } from "@/app/workspace/workspace-terminal-view";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

const largeWorkspaceDiffLineThreshold = 1000;
const defaultWorkspaceToolBrowserUrl = "about:blank";

type WorkspaceToolSemanticDynamicTab =
  | WorkspaceToolSurfaceFilePreviewTab
  | WorkspaceToolSurfaceGitDiffTab;

type WorkspaceToolSemanticDynamicTabInput =
  | Omit<WorkspaceToolSurfaceFilePreviewTab, "id">
  | Omit<WorkspaceToolSurfaceGitDiffTab, "id">;

type WorkspaceToolCssVariableStyle = CSSProperties &
  Record<`--${string}`, string | number>;

type WorkspaceToolPatchSource = "staged" | "unstaged";

interface WorkspaceToolFilePatch {
  fileDiff: FileDiffMetadata;
  source: WorkspaceToolPatchSource;
}

interface WorkspaceToolPatchFile {
  diffs: WorkspaceToolFilePatch[];
  key: string;
  name: string;
  prevName?: string;
}

interface WorkspaceToolSurfaceProps {
  api: ApiClient;
  chatId?: string | null;
  host: WorkspaceToolSurfaceHost;
  root?: string | null;
  trafficLightInset?: boolean;
}

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

const treeHostStyle: WorkspaceToolCssVariableStyle = {
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

const diffHostStyle: WorkspaceToolCssVariableStyle = {
  "--diffs-bg-buffer-override": "var(--muted)",
  "--diffs-bg-context-gutter-override": "var(--background)",
  "--diffs-bg-context-override": "var(--background)",
  "--diffs-bg-separator-override": "var(--muted)",
  "--diffs-dark": "var(--foreground)",
  "--diffs-dark-bg": "var(--background)",
  "--diffs-light": "var(--foreground)",
  "--diffs-light-bg": "var(--background)",
} as const;

export function WorkspaceToolContextBridge({
  chatId,
  root,
}: {
  chatId?: string | null;
  root?: string | null;
}) {
  const setWorkspaceToolContext = useWorkspaceToolStore(
    (state) => state.setWorkspaceToolContext,
  );

  useEffect(() => {
    setWorkspaceToolContext({ chatId, root });
  }, [chatId, root, setWorkspaceToolContext]);

  return null;
}

export function WorkspaceToolDialogHost({ api }: { api: ApiClient }) {
  ensureWorkspaceToolSurfaceEvents();
  const host = useWorkspaceToolStore((state) => state.host);

  if (host !== "dialog") {
    return null;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          useWorkspaceToolStore.getState().requestWorkspaceToolHost("sidebar");
        }
      }}
    >
      <DialogContent
        className="!flex h-[min(90vh,960px)] !w-[calc(100vw-24px)] !max-w-[calc(100vw-24px)] flex-col gap-0 overflow-hidden p-0 sm:!w-[calc(100vw-40px)] sm:!max-w-[calc(100vw-40px)]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Workspace tools</DialogTitle>
        <DialogDescription className="sr-only">
          Workspace tools
        </DialogDescription>
        <WorkspaceToolSurface api={api} host="dialog" />
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceToolWindowPage() {
  ensureWorkspaceToolSurfaceEvents();
  const api = getApiClient();
  const root = useWorkspaceToolStore((state) => state.context.root);
  const trafficLightInset = window.desktopEnvironment.platform === "darwin";

  return (
    <div className="flex h-screen min-h-0 bg-background text-foreground">
      <WorkspaceToolWindowTitleBridge root={root} />
      <WorkspaceToolSurface
        api={api}
        host="window"
        trafficLightInset={trafficLightInset}
      />
    </div>
  );
}

export function WorkspaceToolSurface({
  api,
  chatId: propChatId,
  host,
  root: propRoot,
  trafficLightInset = false,
}: WorkspaceToolSurfaceProps) {
  ensureWorkspaceToolSurfaceEvents();
  const context = useWorkspaceToolStore((state) => state.context);
  const snapshots = useWorkspaceToolStore((state) => state.snapshots);
  const updateSnapshot = useWorkspaceToolStore(
    (state) => state.updateWorkspaceToolSnapshot,
  );
  const requestHost = useWorkspaceToolStore(
    (state) => state.requestWorkspaceToolHost,
  );
  const chatId = propChatId ?? context.chatId ?? null;
  const root = propRoot ?? context.root ?? null;
  const snapshot = currentWorkspaceToolSnapshot(chatId, snapshots);
  const activeTabId = visibleActiveWorkspaceToolTabId(snapshot);
  const activeDynamicTab = snapshot.tabs.find((tab) => tab.id === activeTabId);
  const setSnapshot = useCallback(
    (
      updater: (
        current: WorkspaceToolSurfaceSnapshot,
      ) => WorkspaceToolSurfaceSnapshot,
    ) => {
      if (!chatId) {
        return;
      }

      updateSnapshot(chatId, updater);
    },
    [chatId, updateSnapshot],
  );
  const selectTab = useCallback(
    (tabId: WorkspaceToolPinnedTabId | string) => {
      setSnapshot((current) => ({ ...current, activeTabId: tabId }));
    },
    [setSnapshot],
  );
  const openFileTab = useCallback(
    (path: string) => {
      if (!root) {
        return;
      }

      setSnapshot((current) =>
        openSemanticWorkspaceToolTab(current, {
          kind: "file-preview",
          path,
          root,
          title: path,
        }),
      );
    },
    [root, setSnapshot],
  );
  const openGitDiffTab = useCallback(
    (path: string | undefined, title: string) => {
      if (!root) {
        return;
      }

      setSnapshot((current) =>
        openSemanticWorkspaceToolTab(current, {
          kind: "git-diff",
          path,
          root,
          title,
        }),
      );
    },
    [root, setSnapshot],
  );
  const addTerminalTab = useCallback(() => {
    if (!root) {
      return;
    }

    setSnapshot((current) => {
      const tab = {
        id: crypto.randomUUID(),
        kind: "terminal" as const,
        root,
        sessionId: crypto.randomUUID(),
        title: `Terminal ${current.nextTerminalOrdinal}`,
      };

      return {
        ...current,
        activeTabId: tab.id,
        nextTerminalOrdinal: current.nextTerminalOrdinal + 1,
        tabs: [...current.tabs, tab],
      };
    });
  }, [root, setSnapshot]);
  const addBrowserTab = useCallback(() => {
    setSnapshot((current) => {
      const tab = {
        browserViewId: crypto.randomUUID(),
        draftUrl: defaultWorkspaceToolBrowserUrl,
        id: crypto.randomUUID(),
        kind: "browser" as const,
        title: `Browser ${current.nextBrowserOrdinal}`,
        url: defaultWorkspaceToolBrowserUrl,
      };

      return {
        ...current,
        activeTabId: tab.id,
        nextBrowserOrdinal: current.nextBrowserOrdinal + 1,
        tabs: [...current.tabs, tab],
      };
    });
  }, [setSnapshot]);
  const closeDynamicTab = useCallback(
    (tab: WorkspaceToolSurfaceDynamicTab) => {
      if (tab.kind === "terminal") {
        window.terminal.kill({ sessionId: tab.sessionId });
      }
      if (tab.kind === "browser") {
        void window.workspaceBrowser.destroy({
          browserViewId: tab.browserViewId,
        });
      }

      setSnapshot((current) => {
        const tabIndex = current.tabs.findIndex(
          (candidate) => candidate.id === tab.id,
        );
        const tabs = current.tabs.filter(
          (candidate) => candidate.id !== tab.id,
        );
        const nextActiveTab =
          current.activeTabId === tab.id
            ? (tabs[Math.max(0, Math.min(tabIndex, tabs.length - 1))]?.id ??
              workspaceToolFilesTabId)
            : current.activeTabId;

        return {
          ...current,
          activeTabId: nextActiveTab,
          tabs,
        };
      });
    },
    [setSnapshot],
  );
  const tabItems = useMemo(
    () => workspaceToolTabItems(snapshot.tabs),
    [snapshot.tabs],
  );
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceToolSurfaceHeader
        host={host}
        trafficLightInset={trafficLightInset}
        onRequestHost={requestHost}
      />
      {!chatId || !root ? (
        <WorkspaceToolEmpty title="No workspace tools for this chat" />
      ) : (
        <>
          <WorkspaceToolTabStrip
            activeTabId={activeTabId}
            tabs={tabItems}
            onAddBrowserTab={addBrowserTab}
            onAddTerminalTab={addTerminalTab}
            onCloseDynamicTab={closeDynamicTab}
            onSelectTab={selectTab}
          />
          <div className="min-h-0 flex-1 overflow-hidden">
            <WorkspaceToolContent
              activeDynamicTab={activeDynamicTab}
              activeTabId={activeTabId}
              api={api}
              root={root}
              onBrowserTabChange={setSnapshot}
              onOpenFile={openFileTab}
              onOpenGitDiff={openGitDiffTab}
            />
          </div>
        </>
      )}
    </section>
  );
}

function WorkspaceToolWindowTitleBridge({ root }: { root?: string | null }) {
  useEffect(() => {
    const rootName = root ? workspaceToolRootName(root) : undefined;
    document.title = rootName
      ? `Angel Engine · Workspace tools · ${rootName}`
      : "Angel Engine · Workspace tools";
  }, [root]);

  return null;
}

function WorkspaceToolSurfaceHeader({
  host,
  trafficLightInset,
  onRequestHost,
}: {
  host: WorkspaceToolSurfaceHost;
  trafficLightInset: boolean;
  onRequestHost: (host: WorkspaceToolSurfaceHost) => void;
}) {
  return (
    <div
      className={cn(
        "flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-3",
        trafficLightInset && "pl-[88px]",
      )}
      data-electron-drag={trafficLightInset ? true : undefined}
    >
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        Workspace tools
      </div>
      {host !== "sidebar" ? (
        <Button
          aria-label="Dock tools"
          data-electron-no-drag
          onClick={() => onRequestHost("sidebar")}
          size="icon-xs"
          title="Dock tools"
          type="button"
          variant="ghost"
        >
          <DockIcon />
        </Button>
      ) : null}
      {host !== "dialog" ? (
        <Button
          aria-label="Open tools in dialog"
          data-electron-no-drag
          onClick={() => onRequestHost("dialog")}
          size="icon-xs"
          title="Open tools in dialog"
          type="button"
          variant="ghost"
        >
          <DialogIcon />
        </Button>
      ) : null}
      {host !== "window" ? (
        <Button
          aria-label="Open tools in window"
          data-electron-no-drag
          onClick={() => onRequestHost("window")}
          size="icon-xs"
          title="Open tools in window"
          type="button"
          variant="ghost"
        >
          <WindowIcon />
        </Button>
      ) : null}
      {host !== "sidebar" ? (
        <Button
          aria-label="Close tools"
          data-electron-no-drag
          onClick={() => onRequestHost("sidebar")}
          size="icon-xs"
          title="Close tools"
          type="button"
          variant="ghost"
        >
          <Close />
        </Button>
      ) : null}
    </div>
  );
}

function WorkspaceToolTabStrip({
  activeTabId,
  tabs,
  onAddBrowserTab,
  onAddTerminalTab,
  onCloseDynamicTab,
  onSelectTab,
}: {
  activeTabId: string;
  tabs: WorkspaceToolTabItem[];
  onAddBrowserTab: () => void;
  onAddTerminalTab: () => void;
  onCloseDynamicTab: (tab: WorkspaceToolSurfaceDynamicTab) => void;
  onSelectTab: (tabId: string) => void;
}) {
  return (
    <div
      aria-label="Workspace tool tabs"
      className="flex h-10 shrink-0 items-center gap-1 border-b border-border/70 px-2"
      role="tablist"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const Icon = tab.icon;
          const dynamicTab = tab.dynamicTab;

          return (
            <div
              className={cn(
                "group flex h-7 max-w-44 min-w-0 shrink-0 items-center overflow-hidden rounded-md border border-transparent text-xs text-muted-foreground",
                tab.pinned ? "w-8" : "min-w-28",
                active
                  ? "border-border/80 bg-muted text-foreground"
                  : "hover:bg-muted/60 hover:text-foreground",
              )}
              key={tab.id}
            >
              <button
                aria-selected={active}
                className={cn(
                  "flex h-full min-w-0 flex-1 items-center gap-1.5 px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  tab.pinned && "justify-center",
                )}
                onClick={() => onSelectTab(tab.id)}
                role="tab"
                title={tab.title}
                type="button"
              >
                <Icon className="size-3.5 shrink-0" />
                {!tab.pinned ? (
                  <span className="truncate">{tab.title}</span>
                ) : null}
              </button>
              {dynamicTab ? (
                <button
                  aria-label={`Close ${tab.title}`}
                  className="flex h-full w-6 shrink-0 items-center justify-center text-muted-foreground/70 outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseDynamicTab(dynamicTab);
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="New tool tab"
            className="h-7 border-border/70 px-2 text-xs text-muted-foreground"
            size="xs"
            title="New tool tab"
            type="button"
            variant="outline"
          >
            <Add className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" variant="native">
          <DropdownMenuItem onSelect={onAddTerminalTab}>
            <TerminalIcon className="size-3.5" />
            <span>Terminal</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddBrowserTab}>
            <Browser className="size-3.5" />
            <span>Browser</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface WorkspaceToolTabItem {
  dynamicTab?: WorkspaceToolSurfaceDynamicTab;
  icon: typeof Folder;
  id: string;
  pinned: boolean;
  title: string;
}

function workspaceToolTabItems(
  dynamicTabs: WorkspaceToolSurfaceDynamicTab[],
): WorkspaceToolTabItem[] {
  return [
    {
      icon: Folder,
      id: workspaceToolFilesTabId,
      pinned: true,
      title: "Files",
    },
    {
      icon: GitBranch,
      id: workspaceToolGitTabId,
      pinned: true,
      title: "Git changes",
    },
    ...dynamicTabs.map((tab) => ({
      dynamicTab: tab,
      icon: workspaceToolTabIcon(tab),
      id: tab.id,
      pinned: false,
      title: tab.title,
    })),
  ];
}

function visibleActiveWorkspaceToolTabId(
  snapshot: WorkspaceToolSurfaceSnapshot,
) {
  if (
    snapshot.activeTabId === workspaceToolFilesTabId ||
    snapshot.activeTabId === workspaceToolGitTabId ||
    snapshot.tabs.some((tab) => tab.id === snapshot.activeTabId)
  ) {
    return snapshot.activeTabId;
  }

  return workspaceToolFilesTabId;
}

function WorkspaceToolContent({
  activeDynamicTab,
  activeTabId,
  api,
  root,
  onBrowserTabChange,
  onOpenFile,
  onOpenGitDiff,
}: {
  activeDynamicTab?: WorkspaceToolSurfaceDynamicTab;
  activeTabId: string;
  api: ApiClient;
  root: string;
  onBrowserTabChange: (
    updater: (
      current: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
  onOpenFile: (path: string) => void;
  onOpenGitDiff: (path: string | undefined, title: string) => void;
}) {
  if (activeTabId === workspaceToolFilesTabId) {
    return (
      <WorkspaceFilesPanel api={api} root={root} onOpenFile={onOpenFile} />
    );
  }
  if (activeTabId === workspaceToolGitTabId) {
    return (
      <WorkspaceGitPanel api={api} root={root} onOpenGitDiff={onOpenGitDiff} />
    );
  }
  if (!activeDynamicTab) {
    return <WorkspaceToolEmpty title="Tool unavailable" />;
  }

  switch (activeDynamicTab.kind) {
    case "browser":
      return (
        <WorkspaceBrowserTabContent
          active
          tab={activeDynamicTab}
          onBrowserTabChange={onBrowserTabChange}
        />
      );
    case "file-preview":
      return <WorkspaceFilePreview api={api} tab={activeDynamicTab} />;
    case "git-diff":
      return <WorkspaceGitDiffTool api={api} tab={activeDynamicTab} />;
    case "terminal":
      return (
        <div className="h-full min-h-0 overflow-hidden bg-background p-2">
          <WorkspaceTerminalView
            autoFocus
            root={activeDynamicTab.root}
            sessionId={activeDynamicTab.sessionId}
          />
        </div>
      );
  }
}

function WorkspaceFilesPanel({
  api,
  onOpenFile,
  root,
}: {
  api: ApiClient;
  onOpenFile: (path: string) => void;
  root: string;
}) {
  const { model } = useFileTree({
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    icons: { colored: true, set: "complete" },
    id: `workspace-file-tree-${root}`,
    initialExpansion: 1,
    initialVisibleRowCount: 32,
    paths: [],
    search: false,
  });
  const treeQuery = useQuery({
    queryFn: () => api.workspaceTools.fileTree({ root }),
    queryKey: queryKeys.workspaceTools.fileTree(root),
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
      const path = getClickedFileTreePath(event);
      if (path) {
        onOpenFile(path);
      }
    },
    [onOpenFile],
  );

  if (treeQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(treeQuery.error)}
        title="File tree unavailable"
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

function WorkspaceGitPanel({
  api,
  onOpenGitDiff,
  root,
}: {
  api: ApiClient;
  onOpenGitDiff: (path: string | undefined, title: string) => void;
  root: string;
}) {
  const gitQuery = useQuery({
    queryFn: () => api.workspaceTools.gitDiff({ root }),
    queryKey: queryKeys.workspaceTools.gitDiff(root),
    retry: false,
    staleTime: 5_000,
  });

  if (gitQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(gitQuery.error)}
        title="Git unavailable"
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

  const patchList = buildWorkspaceToolPatchList(
    data.stagedPatch,
    data.unstagedPatch,
  );
  const openFullDiff = () => {
    onOpenGitDiff(
      undefined,
      data.branch ? `Git diff: ${data.branch}` : "Git diff",
    );
  };
  const openFileDiff = (file: WorkspaceToolPatchFile) => {
    onOpenGitDiff(file.name, formatWorkspaceToolPatchFileName(file));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-end border-b border-border/70 px-2">
        <Button
          className="h-7 border-border/70 px-2 text-xs text-muted-foreground"
          onClick={openFullDiff}
          size="xs"
          title="Open git diff"
          type="button"
          variant="outline"
        >
          <DialogIcon className="size-3.5" />
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
        <WorkspaceToolPatchFileList
          patchList={patchList}
          onOpenFile={openFileDiff}
        />
      </div>
    </div>
  );
}

function WorkspaceFilePreview({
  api,
  tab,
}: {
  api: ApiClient;
  tab: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "file-preview" }>;
}) {
  const fileQuery = useQuery({
    queryFn: () =>
      api.workspaceTools.readFile({
        path: tab.path,
        root: tab.root,
      }),
    queryKey: queryKeys.workspaceTools.readFile(tab.root, tab.path),
    retry: false,
    staleTime: 5_000,
  });

  if (fileQuery.isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-6 w-60 rounded-md" />
        <Skeleton className="h-96 w-full rounded-md" />
      </div>
    );
  }

  if (fileQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(fileQuery.error)}
        title="File unavailable"
      />
    );
  }

  return <WorkspaceFileReadResultView result={fileQuery.data} />;
}

function WorkspaceGitDiffTool({
  api,
  tab,
}: {
  api: ApiClient;
  tab: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "git-diff" }>;
}) {
  const gitQuery = useQuery({
    queryFn: () => api.workspaceTools.gitDiff({ root: tab.root }),
    queryKey: queryKeys.workspaceTools.gitDiff(tab.root),
    retry: false,
    staleTime: 5_000,
  });

  if (gitQuery.isLoading) {
    return (
      <div className="space-y-3 p-3">
        <Skeleton className="h-7 w-32 rounded-md" />
        <Skeleton className="h-24 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (gitQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(gitQuery.error)}
        title="Git unavailable"
      />
    );
  }

  return (
    <WorkspaceGitDiffResultView data={gitQuery.data} pathFilter={tab.path} />
  );
}

function WorkspaceBrowserTabContent({
  active,
  onBrowserTabChange,
  tab,
}: {
  active: boolean;
  onBrowserTabChange: (
    updater: (
      current: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
  tab: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "browser" }>;
}) {
  const [browserState, setBrowserState] = useState<WorkspaceBrowserState>({
    canGoBack: false,
    canGoForward: false,
    ready: false,
    title: tab.title,
    url: tab.url,
  });

  useEffect(() => {
    void window.workspaceBrowser
      .getState({ browserViewId: tab.browserViewId })
      .then(setBrowserState)
      .catch(() => {});
  }, [tab.browserViewId]);

  const updateBrowserTab = useCallback(
    (
      updater: (
        current: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "browser" }>,
      ) => Extract<WorkspaceToolSurfaceDynamicTab, { kind: "browser" }>,
    ) => {
      onBrowserTabChange((current) => ({
        ...current,
        tabs: current.tabs.map((candidate) =>
          candidate.id === tab.id && candidate.kind === "browser"
            ? updater(candidate)
            : candidate,
        ),
      }));
    },
    [onBrowserTabChange, tab.id],
  );
  const handleStateChange = useCallback(
    (state: WorkspaceBrowserState) => {
      setBrowserState(state);
      updateBrowserTab((current) => ({
        ...current,
        draftUrl: state.url || current.draftUrl,
        title: state.title.trim() || browserTitleFromUrl(state.url),
        url: state.url || current.url,
      }));
    },
    [updateBrowserTab],
  );
  const updateDraftUrl = useCallback(
    (draftUrl: string) => {
      updateBrowserTab((current) => ({ ...current, draftUrl }));
    },
    [updateBrowserTab],
  );
  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextUrl = normalizeWorkspaceBrowserUrl(tab.draftUrl);

      updateBrowserTab((current) => ({
        ...current,
        draftUrl: nextUrl,
        title: browserTitleFromUrl(nextUrl),
        url: nextUrl,
      }));
      setBrowserState((current) => ({
        ...current,
        title: browserTitleFromUrl(nextUrl),
        url: nextUrl,
      }));
      void window.workspaceBrowser
        .navigate({ browserViewId: tab.browserViewId, url: nextUrl })
        .then(handleStateChange)
        .catch(() => {});
    },
    [handleStateChange, tab.browserViewId, tab.draftUrl, updateBrowserTab],
  );
  const goBack = useCallback(() => {
    void window.workspaceBrowser
      .goBack({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch(() => {});
  }, [handleStateChange, tab.browserViewId]);
  const goForward = useCallback(() => {
    void window.workspaceBrowser
      .goForward({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch(() => {});
  }, [handleStateChange, tab.browserViewId]);
  const reload = useCallback(() => {
    void window.workspaceBrowser
      .reload({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch(() => {});
  }, [handleStateChange, tab.browserViewId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-2"
        onSubmit={handleSubmit}
      >
        <Button
          aria-label="Back"
          disabled={!browserState.canGoBack}
          onClick={goBack}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="Forward"
          disabled={!browserState.canGoForward}
          onClick={goForward}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <ArrowRight />
        </Button>
        <Button
          aria-label="Reload"
          disabled={!browserState.ready}
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
          onChange={(event) => updateDraftUrl(event.currentTarget.value)}
          value={tab.draftUrl}
        />
      </form>
      <WorkspaceBrowserNativeView
        active={active}
        browserViewId={tab.browserViewId}
        onStateChange={handleStateChange}
        url={tab.url}
      />
    </div>
  );
}

function WorkspaceFileReadResultView({
  result,
}: {
  result?: WorkspaceFileReadResult;
}) {
  if (!result) {
    return <WorkspaceToolEmpty title="File unavailable" />;
  }

  if (result.type === "unsupported") {
    return (
      <WorkspaceToolEmpty
        detail={formatUnsupportedFileReason(result)}
        title={result.path}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/70 px-3 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={result.path}>
          {result.path}
        </span>
        <span>{formatBytes(result.size)}</span>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-xs leading-5 whitespace-pre text-foreground">
        {result.content}
      </pre>
    </div>
  );
}

function WorkspaceGitDiffResultView({
  data,
  pathFilter,
}: {
  data?: WorkspaceGitDiffResult;
  pathFilter?: string;
}) {
  if (!data?.isGitRepository) {
    return <WorkspaceToolEmpty title="Not a Git repository" />;
  }

  const patchList = buildWorkspaceToolPatchList(
    data.stagedPatch,
    data.unstagedPatch,
  );
  const files = pathFilter
    ? patchList.files.filter((file) => file.name === pathFilter)
    : patchList.files;

  return (
    <div className="h-full min-h-0 overflow-auto p-3">
      {data.warnings.length > 0 ? (
        <div className="mb-3 space-y-1 rounded-md border border-border/70 bg-muted/30 p-2 text-xs text-muted-foreground">
          {data.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
      {patchList.errors.map((error) => (
        <div
          className="mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          key={error}
        >
          {error}
        </div>
      ))}
      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((file) => (
            <WorkspaceToolPatchFileItem file={file} key={file.key} />
          ))}
        </div>
      ) : (
        <WorkspaceToolEmpty
          detail={pathFilter}
          title={pathFilter ? "No diff for file" : "No changes"}
        />
      )}
    </div>
  );
}

function WorkspaceToolPatchFileList({
  onOpenFile,
  patchList,
}: {
  onOpenFile?: (file: WorkspaceToolPatchFile) => void;
  patchList: {
    errors: string[];
    files: WorkspaceToolPatchFile[];
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
          <WorkspaceToolPatchFileItem
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

function WorkspaceToolPatchFileItem({
  file,
  onOpenFile,
}: {
  file: WorkspaceToolPatchFile;
  onOpenFile?: (file: WorkspaceToolPatchFile) => void;
}) {
  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineCount = getWorkspaceToolPatchFileLineCount(file);

  return (
    <Collapsible
      className="overflow-hidden rounded-md border border-border/70 bg-background"
      defaultOpen={lineCount <= largeWorkspaceDiffLineThreshold}
    >
      <CollapsibleTrigger
        className="group flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
        onClick={(event) => {
          if (onOpenFile) {
            event.preventDefault();
            onOpenFile(file);
          }
        }}
        type="button"
      >
        <span className="text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90">
          ▾
        </span>
        <span
          className="min-w-0 flex-1 truncate font-medium text-foreground"
          title={fileName}
        >
          {fileName}
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {formatWorkspaceToolPatchFileSummary(file.diffs, lineCount)}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="space-y-2 border-t border-border/70">
          {file.diffs.map((diff, index) => (
            <div
              className="overflow-hidden"
              key={workspaceToolFileDiffKey(diff.source, diff.fileDiff, index)}
            >
              {file.diffs.length > 1 ? (
                <div className="border-b border-border/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
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
      </CollapsibleContent>
    </Collapsible>
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
    queryFn: () => preloadWorkspaceToolFileDiffHighlighter(fileDiff),
    queryKey: [
      "workspace-tool-file-diff-highlighter",
      preloadKey,
      workspaceToolFileDiffVersion(fileDiff),
    ],
    retry: false,
    staleTime: Infinity,
  });

  if (!preloadQuery.data && !preloadQuery.isError) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-6 w-48 rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
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
      className="block overflow-hidden bg-background"
      disableWorkerPool
      fileDiff={fileDiff}
      key={preloadKey}
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
    [...languages].map((language) =>
      preloadHighlighter(getHighlighterOptions(language, diffOptions)),
    ),
  );

  return true;
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
      <div className="max-w-80 space-y-1">
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

function openSemanticWorkspaceToolTab(
  snapshot: WorkspaceToolSurfaceSnapshot,
  tab: WorkspaceToolSemanticDynamicTabInput,
): WorkspaceToolSurfaceSnapshot {
  const existing = snapshot.tabs.find((candidate) => {
    if (candidate.kind !== tab.kind) {
      return false;
    }
    if (candidate.root !== tab.root) {
      return false;
    }
    if (candidate.kind === "file-preview" && tab.kind === "file-preview") {
      return candidate.path === tab.path;
    }
    if (candidate.kind === "git-diff" && tab.kind === "git-diff") {
      return candidate.path === tab.path;
    }
    return false;
  });

  if (existing) {
    return {
      ...snapshot,
      activeTabId: existing.id,
    };
  }

  const nextTab: WorkspaceToolSemanticDynamicTab =
    tab.kind === "file-preview"
      ? {
          ...tab,
          id: crypto.randomUUID(),
        }
      : {
          ...tab,
          id: crypto.randomUUID(),
        };

  return {
    ...snapshot,
    activeTabId: nextTab.id,
    tabs: [...snapshot.tabs, nextTab],
  };
}

function workspaceToolTabIcon(tab: WorkspaceToolSurfaceDynamicTab) {
  switch (tab.kind) {
    case "browser":
      return Browser;
    case "file-preview":
      return FileText;
    case "git-diff":
      return GitBranch;
    case "terminal":
      return TerminalIcon;
  }
}

function getClickedFileTreePath(event: ReactMouseEvent<HTMLElement>) {
  const directTarget =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          "[data-item-path][data-item-type='file']",
        )
      : null;
  if (directTarget?.dataset.itemPath) {
    return directTarget.dataset.itemPath;
  }

  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }
    if (
      target.dataset.itemType === "file" &&
      typeof target.dataset.itemPath === "string" &&
      target.dataset.itemPath.length > 0
    ) {
      return target.dataset.itemPath;
    }
  }

  return null;
}

function buildWorkspaceToolPatchList(
  stagedPatch: string,
  unstagedPatch: string,
) {
  const staged = parseWorkspaceToolPatch(stagedPatch, "workspace-tool-staged");
  const unstaged = parseWorkspaceToolPatch(
    unstagedPatch,
    "workspace-tool-unstaged",
  );
  const files = groupWorkspaceToolPatchFiles([
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
    errors: [staged.error, unstaged.error].flatMap((error) =>
      error ? [error] : [],
    ),
    files,
  };
}

function parseWorkspaceToolPatch(
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

function groupWorkspaceToolPatchFiles(diffs: WorkspaceToolFilePatch[]) {
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

function formatWorkspaceToolPatchFileName(file: {
  name: string;
  prevName?: string;
}) {
  return file.prevName ? `${file.prevName} -> ${file.name}` : file.name;
}

function formatWorkspaceToolPatchSource(source: WorkspaceToolPatchSource) {
  return source === "staged" ? "Staged" : "Unstaged";
}

function formatWorkspaceToolPatchSourceSummary(
  diffs: WorkspaceToolFilePatch[],
) {
  const sources = new Set(diffs.map((diff) => diff.source));

  if (sources.has("staged") && sources.has("unstaged")) {
    return "staged + unstaged";
  }
  return formatWorkspaceToolPatchSource(
    diffs[0]?.source ?? "unstaged",
  ).toLowerCase();
}

function formatWorkspaceToolPatchFileSummary(
  diffs: WorkspaceToolFilePatch[],
  lineCount: number,
) {
  return `${formatWorkspaceToolPatchSourceSummary(diffs)} · ${lineCount.toLocaleString()} lines`;
}

function getWorkspaceToolPatchFileLineCount(file: WorkspaceToolPatchFile) {
  return file.diffs.reduce(
    (total, diff) => total + diff.fileDiff.unifiedLineCount,
    0,
  );
}

function workspaceToolFileDiffKey(
  source: WorkspaceToolPatchSource,
  fileDiff: FileDiffMetadata,
  index: number,
) {
  return `${source}:${index}:${fileDiff.cacheKey ?? fileDiff.prevName ?? ""}:${fileDiff.name}`;
}

function workspaceToolFileDiffVersion(fileDiff: FileDiffMetadata) {
  return [
    fileDiff.unifiedLineCount,
    fileDiff.splitLineCount,
    ...fileDiff.hunks.map((hunk) => hunk.hunkSpecs ?? ""),
    ...fileDiff.deletionLines,
    ...fileDiff.additionLines,
  ].join("\n");
}

function formatUnsupportedFileReason(
  result: Extract<WorkspaceFileReadResult, { type: "unsupported" }>,
) {
  switch (result.reason) {
    case "binary":
      return "Binary file";
    case "too-large":
      return result.size === undefined
        ? "File is too large"
        : `File is too large (${formatBytes(result.size)})`;
  }
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function toTreeGitStatus(status: WorkspaceToolGitStatus): GitStatus {
  return status;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function workspaceToolRootName(root: string) {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}
