import type { FileDiffMetadata } from "@pierre/diffs";
import type { GitStatus } from "@pierre/trees";
import type { WorkspaceBrowserState } from "@shared/workspace-browser";
import type {
  WorkspaceToolPinnedTabId,
  WorkspaceToolSurfaceDynamicTab,
  WorkspaceToolSurfaceHost,
  WorkspaceToolSurfaceSnapshot,
} from "@shared/workspace-tool-surface";
import type {
  WorkspaceFileReadResult,
  WorkspaceGitDiffResult,
  WorkspaceToolGitStatus,
} from "@shared/workspace-tools";
import type { QueryClient } from "@tanstack/react-query";
import type {
  CSSProperties,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import type { WorkspaceWideFileState } from "@/app/workspace/workspace-tool-store";
import type { ApiClient } from "@/platform/api-client";

import {
  DEFAULT_VIRTUAL_FILE_METRICS,
  getFiletypeFromFileName,
  getHighlighterOptions,
  parsePatchFiles,
  preloadHighlighter,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
  prepareFileTreeInput,
} from "@pierre/trees";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  RiAddLine as Add,
  RiArrowLeftLine as ArrowLeft,
  RiArrowRightLine as ArrowRight,
  RiGlobalLine as Browser,
  RiCloseLine as Close,
  RiExternalLinkLine as DialogIcon,
  RiSidebarFoldLine as DockIcon,
  RiFileTextLine as FileText,
  RiFolderLine as Folder,
  RiGitBranchLine as GitBranch,
  RiRefreshLine as Refresh,
  RiTerminalBoxLine as TerminalIcon,
  RiWindowLine as WindowIcon,
} from "@remixicon/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { basename } from "pathe";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  browserTitleFromUrl,
  normalizeWorkspaceBrowserUrl,
} from "@/app/workspace/workspace-browser-url";
import { WorkspaceBrowserNativeView } from "@/app/workspace/workspace-browser-view";
import { WorkspaceTerminalView } from "@/app/workspace/workspace-terminal-view";
import {
  currentWorkspaceToolSnapshot,
  emptyWorkspaceWideFilesState,
  ensureWorkspaceToolSurfaceEvents,
  isWorkspaceWideFileStateDirty,
  useWorkspaceToolStore,
  workspaceToolFilesTabId,
  workspaceToolGitTabId,
} from "@/app/workspace/workspace-tool-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";
import {
  defineWorkspaceMonacoThemes,
  workspaceMonacoThemeDark,
  workspaceMonacoThemeLight,
} from "@/app/workspace/workspace-monaco-theme";

const defaultWorkspaceToolBrowserUrl = "about:blank";

const loadWorkspaceMonacoModule = async () => import("monaco-editor");

const WorkspaceMonacoEditor = lazy(async () => {
  const [editorModule, monacoModule] = await Promise.all([
    import("@monaco-editor/react"),
    loadWorkspaceMonacoModule(),
  ]);
  editorModule.loader.config({ monaco: monacoModule });
  disableWorkspaceMonacoTypeScriptServices(monacoModule);
  defineWorkspaceMonacoThemes(monacoModule);

  return { default: editorModule.default };
});

const workspaceMonacoDisplayEditorOptions = {
  "semanticHighlighting.enabled": false,
  acceptSuggestionOnEnter: "off",
  automaticLayout: true,
  codeLens: false,
  colorDecorators: false,
  contextmenu: false,
  folding: false,
  fontSize: 12,
  hover: { enabled: false },
  links: false,
  minimap: { enabled: false },
  parameterHints: { enabled: false },
  quickSuggestions: false,
  renderValidationDecorations: "off",
  scrollBeyondLastLine: false,
  selectionHighlight: false,
  suggestOnTriggerCharacters: false,
  tabCompletion: "off",
  wordBasedSuggestions: "off",
} as const;

const workspaceFileIconResolver = createFileTreeIconResolver({
  colored: true,
  set: "complete",
});
const workspaceFileTreeIconSpriteSheet = getBuiltInSpriteSheet("complete");

const workspaceMonacoLanguageByFileTreeToken: Partial<Record<string, string>> =
  {
    astro: "html",
    babel: "javascript",
    bash: "shell",
    c: "c",
    cpp: "cpp",
    css: "css",
    database: "sql",
    docker: "dockerfile",
    go: "go",
    graphql: "graphql",
    html: "html",
    javascript: "javascript",
    json: "json",
    markdown: "markdown",
    npm: "json",
    python: "python",
    react: "typescript",
    ruby: "ruby",
    rust: "rust",
    sass: "scss",
    svg: "xml",
    swift: "swift",
    typescript: "typescript",
    vue: "html",
    yml: "yaml",
  };

type WorkspaceToolCssVariableStyle = CSSProperties &
  Record<`--${string}`, string | number>;
type WorkspaceToolTabSelectHandler = (
  tabId: string,
) => boolean | Promise<boolean> | void;

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

interface WorkspaceToolPatchFileLineChanges {
  additions: number;
  deletions: number;
}

interface WorkspaceToolSurfaceProps {
  active?: boolean;
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
const diffMetrics = {
  ...DEFAULT_VIRTUAL_FILE_METRICS,
  paddingTop: 0,
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

const workspaceFileTreeIconColorStyle: WorkspaceToolCssVariableStyle = {
  "--trees-file-icon-color-astro":
    "var(--trees-file-icon-color, var(--trees-icon-purple))",
  "--trees-file-icon-color-babel":
    "var(--trees-file-icon-color, var(--trees-icon-yellow))",
  "--trees-file-icon-color-bash":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-biome":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-bootstrap":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-browserslist":
    "var(--trees-file-icon-color, var(--trees-icon-yellow))",
  "--trees-file-icon-color-bun":
    "var(--trees-file-icon-color, var(--trees-icon-mauve))",
  "--trees-file-icon-color-c":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-claude":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-cpp":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-css":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-database":
    "var(--trees-file-icon-color, var(--trees-icon-purple))",
  "--trees-file-icon-color-default":
    "var(--trees-file-icon-color, var(--trees-icon-gray))",
  "--trees-file-icon-color-docker":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-eslint":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-git":
    "var(--trees-file-icon-vermilion, var(--trees-icon-vermilion))",
  "--trees-file-icon-color-go":
    "var(--trees-file-icon-color, var(--trees-icon-cyan))",
  "--trees-file-icon-color-graphql":
    "var(--trees-file-icon-color, var(--trees-icon-pink))",
  "--trees-file-icon-color-html":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-image":
    "var(--trees-file-icon-color, var(--trees-icon-pink))",
  "--trees-file-icon-color-javascript":
    "var(--trees-file-icon-color, var(--trees-icon-yellow))",
  "--trees-file-icon-color-json":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-markdown":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-mcp":
    "var(--trees-file-icon-color, var(--trees-icon-teal))",
  "--trees-file-icon-color-npm":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-oxc":
    "var(--trees-file-icon-cyan, var(--trees-icon-cyan))",
  "--trees-file-icon-color-postcss":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-prettier":
    "var(--trees-file-icon-color, var(--trees-icon-teal))",
  "--trees-file-icon-color-python":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-react":
    "var(--trees-file-icon-color, var(--trees-icon-cyan))",
  "--trees-file-icon-color-ruby":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-rust":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-sass":
    "var(--trees-file-icon-color, var(--trees-icon-pink))",
  "--trees-file-icon-color-svg":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-svelte":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-svgo":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-swift":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-table":
    "var(--trees-file-icon-color, var(--trees-icon-teal))",
  "--trees-file-icon-color-tailwind":
    "var(--trees-file-icon-color, var(--trees-icon-cyan))",
  "--trees-file-icon-color-terraform":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-text":
    "var(--trees-file-icon-color, var(--trees-icon-gray))",
  "--trees-file-icon-color-typescript":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-vite":
    "var(--trees-file-icon-color, var(--trees-icon-purple))",
  "--trees-file-icon-color-vscode":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-vue":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-wasm":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-webpack":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-yml":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-zig":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-zip":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-icon-blue": "light-dark(#1a85d4, #69b1ff)",
  "--trees-icon-cyan": "light-dark(#1ca1c7, #68cdf2)",
  "--trees-icon-gray": "light-dark(#84848a, #adadb1)",
  "--trees-icon-green": "light-dark(#199f43, #5ecc71)",
  "--trees-icon-indigo": "light-dark(#693acf, #9d6afb)",
  "--trees-icon-mauve": "light-dark(#594c5b, #79697b)",
  "--trees-icon-orange": "light-dark(#d47628, #ffa359)",
  "--trees-icon-pink": "light-dark(#d32a61, #ff678d)",
  "--trees-icon-purple": "light-dark(#a631be, #d568ea)",
  "--trees-icon-red": "light-dark(#d52c36, #ff6762)",
  "--trees-icon-teal": "light-dark(#17a5af, #64d1db)",
  "--trees-icon-vermilion": "light-dark(#ff8c5b, #d5512f)",
  "--trees-icon-yellow": "light-dark(#d5a910, #ffd452)",
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
  const syncWorkspaceToolContext = useWorkspaceToolStore(
    (state) => state.syncWorkspaceToolContext,
  );

  useEffect(() => {
    syncWorkspaceToolContext({ chatId, root });
  }, [chatId, root, syncWorkspaceToolContext]);

  return null;
}

export function WorkspaceToolDialogHost({ api }: { api: ApiClient }) {
  ensureWorkspaceToolSurfaceEvents();
  const queryClient = useQueryClient();
  const host = useWorkspaceToolStore((state) => state.host);
  const root = useWorkspaceToolStore((state) => state.context.root ?? null);
  const closeDialog = useCallback(async () => {
    if (!(await confirmWorkspaceWideFilesExit({ api, queryClient, root }))) {
      return;
    }
    useWorkspaceToolStore.getState().requestWorkspaceToolHost("sidebar");
  }, [api, queryClient, root]);

  if (host !== "dialog") {
    return null;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          void closeDialog();
        }
      }}
    >
      <DialogContent
        className="
          flex! h-[min(90vh,960px)] w-[calc(100vw-24px)]!
          max-w-[calc(100vw-24px)]! flex-col gap-0 overflow-hidden p-0
          sm:w-[calc(100vw-40px)]! sm:max-w-[calc(100vw-40px)]!
        "
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
  active = true,
  api,
  chatId: propChatId,
  host,
  root: propRoot,
  trafficLightInset = false,
}: WorkspaceToolSurfaceProps) {
  ensureWorkspaceToolSurfaceEvents();
  const queryClient = useQueryClient();
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
  const openWorkspaceWideFile = useWorkspaceWideFileOpener(api);
  const confirmWideFilesEditorExit = useCallback(async () => {
    if (host === "sidebar") {
      return true;
    }
    return confirmWorkspaceWideFilesExit({ api, queryClient, root });
  }, [api, host, queryClient, root]);
  const requestSurfaceHost = useCallback(
    async (nextHost: WorkspaceToolSurfaceHost) => {
      if (nextHost !== host && !(await confirmWideFilesEditorExit())) {
        return;
      }
      requestHost(nextHost);
    },
    [confirmWideFilesEditorExit, host, requestHost],
  );
  const setSnapshot = useCallback(
    (
      updater: (
        current: WorkspaceToolSurfaceSnapshot,
      ) => WorkspaceToolSurfaceSnapshot,
    ) => {
      if (!is.nonEmptyString(chatId)) {
        return;
      }

      updateSnapshot(chatId, updater);
    },
    [chatId, updateSnapshot],
  );
  const selectTab = useCallback(
    async (tabId: WorkspaceToolPinnedTabId | string) => {
      if (tabId !== activeTabId && !(await confirmWideFilesEditorExit())) {
        return false;
      }
      setSnapshot((current) => ({ ...current, activeTabId: tabId }));
      return true;
    },
    [activeTabId, confirmWideFilesEditorExit, setSnapshot],
  );
  const openFileTab = useCallback(
    (path: string) => {
      if (!is.nonEmptyString(root)) {
        return;
      }

      openWorkspaceWideFile({ path, root });
      setSnapshot((current) => ({
        ...current,
        activeTabId: workspaceToolFilesTabId,
      }));
      if (host === "sidebar") {
        void requestSurfaceHost("dialog");
      }
    },
    [host, openWorkspaceWideFile, requestSurfaceHost, root, setSnapshot],
  );
  const addTerminalTab = useCallback(() => {
    if (!is.nonEmptyString(root)) {
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
        void window.workspaceBrowser
          .destroy({
            browserViewId: tab.browserViewId,
          })
          .catch((error: unknown) => {
            console.error("Failed to destroy workspace browser view.", {
              browserViewId: tab.browserViewId,
              error,
              tabId: tab.id,
            });
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
    <section
      className="
        flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden
        bg-background text-foreground
      "
    >
      {host !== "sidebar" ? (
        <WorkspaceToolSurfaceHeader
          host={host}
          trafficLightInset={trafficLightInset}
          onRequestHost={(nextHost) => {
            void requestSurfaceHost(nextHost);
          }}
        />
      ) : null}
      {!is.nonEmptyString(chatId) || !is.nonEmptyString(root) ? (
        <WorkspaceToolEmpty title="No workspace tools for this chat" />
      ) : host === "sidebar" ? (
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
              surfaceActive={active}
              root={root}
              onBrowserTabChange={setSnapshot}
              onOpenFile={openFileTab}
            />
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <WorkspaceToolVerticalTabSidebar
            activeTabId={activeTabId}
            tabs={tabItems}
            onAddBrowserTab={addBrowserTab}
            onAddTerminalTab={addTerminalTab}
            onCloseDynamicTab={closeDynamicTab}
            onSelectTab={selectTab}
          />
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <WorkspaceToolWideContent
              activeDynamicTab={activeDynamicTab}
              activeTabId={activeTabId}
              api={api}
              root={root}
              surfaceActive={active}
              onBrowserTabChange={setSnapshot}
              onOpenFile={openFileTab}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function WorkspaceToolWindowTitleBridge({ root }: { root?: string | null }) {
  useEffect(() => {
    const rootName = is.nonEmptyString(root)
      ? workspaceToolRootName(root)
      : undefined;
    document.title = is.nonEmptyString(rootName)
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
        trafficLightInset && "h-12 pl-[88px]",
      )}
      data-electron-drag={trafficLightInset ? true : undefined}
    >
      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        Workspace tools
      </div>
      <WorkspaceToolSurfaceHostControls
        host={host}
        onRequestHost={onRequestHost}
      />
    </div>
  );
}

export function WorkspaceToolSurfaceHostControls({
  host,
  onRequestHost,
}: {
  host: WorkspaceToolSurfaceHost;
  onRequestHost: (host: WorkspaceToolSurfaceHost) => void;
}) {
  return (
    <>
      {host !== "sidebar" ? (
        <WorkspaceToolSurfaceHostButton
          icon={<DockIcon />}
          label="Dock tools in sidebar"
          onClick={() => onRequestHost("sidebar")}
        />
      ) : null}
      {host !== "dialog" ? (
        <WorkspaceToolSurfaceHostButton
          icon={<DialogIcon />}
          label="Open tools in dialog"
          onClick={() => onRequestHost("dialog")}
        />
      ) : null}
      {host !== "window" ? (
        <WorkspaceToolSurfaceHostButton
          icon={<WindowIcon />}
          label="Open tools in window"
          onClick={() => onRequestHost("window")}
        />
      ) : null}
      {host === "dialog" ? (
        <WorkspaceToolSurfaceHostButton
          icon={<Close />}
          label="Close tools dialog"
          onClick={() => onRequestHost("sidebar")}
        />
      ) : null}
    </>
  );
}

function WorkspaceToolSurfaceHostButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="text-muted-foreground"
          data-electron-no-drag
          onClick={onClick}
          size="icon-sm"
          title={label}
          type="button"
          variant="ghost"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function useWorkspaceToolTabKeyboard({
  onSelectTab,
  orientation,
  tabs,
}: {
  onSelectTab: WorkspaceToolTabSelectHandler;
  orientation: "horizontal" | "vertical";
  tabs: WorkspaceToolTabItem[];
}) {
  const tabButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const setTabButtonRef = useCallback(
    (tabId: string, button: HTMLButtonElement | null) => {
      if (button) {
        tabButtonsRef.current.set(tabId, button);
      } else {
        tabButtonsRef.current.delete(tabId);
      }
    },
    [],
  );
  const selectAndFocusTab = useCallback(
    (index: number) => {
      const tab = tabs.at(index);
      if (tab === undefined) {
        return;
      }

      void Promise.resolve(onSelectTab(tab.id)).then((selected) => {
        if (selected === false) {
          return;
        }
        window.requestAnimationFrame(() => {
          tabButtonsRef.current.get(tab.id)?.focus();
        });
      });
    },
    [onSelectTab, tabs],
  );
  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, tabId: string) => {
      const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
      if (currentIndex < 0) {
        return;
      }

      let nextIndex: number | null = null;
      if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabs.length - 1;
      } else if (
        (orientation === "horizontal" && event.key === "ArrowRight") ||
        (orientation === "vertical" && event.key === "ArrowDown")
      ) {
        nextIndex = (currentIndex + 1) % tabs.length;
      } else if (
        (orientation === "horizontal" && event.key === "ArrowLeft") ||
        (orientation === "vertical" && event.key === "ArrowUp")
      ) {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      }

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      selectAndFocusTab(nextIndex);
    },
    [orientation, selectAndFocusTab, tabs],
  );

  return { handleTabKeyDown, setTabButtonRef };
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
  onSelectTab: WorkspaceToolTabSelectHandler;
}) {
  const { handleTabKeyDown, setTabButtonRef } = useWorkspaceToolTabKeyboard({
    onSelectTab,
    orientation: "horizontal",
    tabs,
  });

  return (
    <div
      aria-label="Workspace tool tabs"
      className="
        flex h-9 shrink-0 items-stretch border-b border-border/70 bg-muted/20
      "
      role="tablist"
    >
      <div className="flex min-w-0 shrink items-stretch overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const Icon = tab.icon;
          const dynamicTab = tab.dynamicTab;

          return (
            <div
              className={cn(
                `
                  group relative flex h-full max-w-48 min-w-0 shrink-0
                  items-center overflow-hidden border-r border-border/60 text-xs
                  text-muted-foreground
                `,
                tab.pinned ? "w-9" : "min-w-32",
                active
                  ? `
                    bg-background text-foreground
                    after:absolute after:inset-x-0 after:bottom-0 after:h-px
                    after:bg-primary
                  `
                  : `
                    bg-muted/20
                    hover:bg-muted/60 hover:text-foreground
                  `,
              )}
              key={tab.id}
            >
              <button
                aria-selected={active}
                className={cn(
                  `
                    flex h-full min-w-0 flex-1 items-center gap-1.5 px-2
                    text-left outline-none
                    focus-visible:ring-2 focus-visible:ring-ring/30
                  `,
                  tab.pinned && "justify-center",
                )}
                onClick={() => {
                  void onSelectTab(tab.id);
                }}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                ref={(button) => setTabButtonRef(tab.id, button)}
                role="tab"
                tabIndex={active ? 0 : -1}
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
                  className="
                    flex h-full w-6 shrink-0 items-center justify-center
                    text-muted-foreground/70 outline-none
                    hover:bg-foreground/5 hover:text-foreground
                    focus-visible:ring-2 focus-visible:ring-ring/30
                  "
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseDynamicTab(dynamicTab);
                  }}
                  tabIndex={active ? 0 : -1}
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
      <WorkspaceToolNewTabMenu
        onAddBrowserTab={onAddBrowserTab}
        onAddTerminalTab={onAddTerminalTab}
      />
    </div>
  );
}

function WorkspaceToolVerticalTabSidebar({
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
  onSelectTab: WorkspaceToolTabSelectHandler;
}) {
  const { handleTabKeyDown, setTabButtonRef } = useWorkspaceToolTabKeyboard({
    onSelectTab,
    orientation: "vertical",
    tabs,
  });

  return (
    <div
      aria-label="Workspace tool tabs"
      aria-orientation="vertical"
      className="
        flex w-56 shrink-0 flex-col border-r border-border/70 bg-muted/20
      "
      role="tablist"
    >
      <div className="flex h-12 shrink-0 items-center px-2">
        <WorkspaceToolNewTabMenu
          variant="row"
          onAddBrowserTab={onAddBrowserTab}
          onAddTerminalTab={onAddTerminalTab}
        />
      </div>
      <div
        className={cn(
          "-mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2",
        )}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const Icon = tab.icon;
          const dynamicTab = tab.dynamicTab;

          return (
            <div
              className={cn(
                `
                  group flex h-8 min-w-0 shrink-0 items-center overflow-hidden
                  rounded-md border border-transparent text-xs
                  text-muted-foreground
                `,
                active
                  ? "border-border/80 bg-background text-foreground shadow-sm"
                  : "hover:bg-background/80 hover:text-foreground",
              )}
              key={tab.id}
            >
              <button
                aria-selected={active}
                className="
                  flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left
                  outline-none
                  focus-visible:ring-2 focus-visible:ring-ring/30
                "
                onClick={() => {
                  void onSelectTab(tab.id);
                }}
                onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                ref={(button) => setTabButtonRef(tab.id, button)}
                role="tab"
                tabIndex={active ? 0 : -1}
                title={tab.title}
                type="button"
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate">{tab.title}</span>
              </button>
              {dynamicTab ? (
                <button
                  aria-label={`Close ${tab.title}`}
                  className="
                    flex h-full w-7 shrink-0 items-center justify-center
                    text-muted-foreground/70 outline-none
                    hover:bg-foreground/5 hover:text-foreground
                    focus-visible:ring-2 focus-visible:ring-ring/30
                  "
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseDynamicTab(dynamicTab);
                  }}
                  tabIndex={active ? 0 : -1}
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
    </div>
  );
}

function WorkspaceToolNewTabMenu({
  onAddBrowserTab,
  onAddTerminalTab,
  variant = "icon",
}: {
  onAddBrowserTab: () => void;
  onAddTerminalTab: () => void;
  variant?: "icon" | "row";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="New tool tab"
          className={cn(
            "text-xs",
            variant === "row"
              ? `
                h-8 w-full justify-start gap-2 border-border/70 px-2
                text-muted-foreground
              `
              : "h-full w-8 rounded-none border-0 px-0 text-muted-foreground",
          )}
          size={variant === "row" ? "xs" : "icon-xs"}
          title="New tool tab"
          type="button"
          variant={variant === "row" ? "outline" : "ghost"}
        >
          <Add className="size-3.5" />
          {variant === "row" ? (
            <span className="truncate">New tool tab</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "row" ? "start" : "end"}
        variant="native"
      >
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
  surfaceActive,
  onBrowserTabChange,
  onOpenFile,
}: {
  activeDynamicTab?: WorkspaceToolSurfaceDynamicTab;
  activeTabId: string;
  api: ApiClient;
  root: string;
  surfaceActive: boolean;
  onBrowserTabChange: (
    updater: (
      current: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
  onOpenFile: (path: string) => void;
}) {
  if (activeTabId === workspaceToolFilesTabId) {
    return (
      <WorkspaceFilesPanel api={api} root={root} onOpenFile={onOpenFile} />
    );
  }
  if (activeTabId === workspaceToolGitTabId) {
    return <WorkspaceGitPanel api={api} root={root} />;
  }
  if (!activeDynamicTab) {
    return <WorkspaceToolEmpty title="Tool unavailable" />;
  }

  switch (activeDynamicTab.kind) {
    case "browser":
      return (
        <WorkspaceBrowserTabContent
          active={surfaceActive}
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
            focusOnMount
            root={activeDynamicTab.root}
            sessionId={activeDynamicTab.sessionId}
          />
        </div>
      );
  }
}

function WorkspaceToolWideContent({
  activeDynamicTab,
  activeTabId,
  api,
  root,
  surfaceActive,
  onBrowserTabChange,
  onOpenFile,
}: {
  activeDynamicTab?: WorkspaceToolSurfaceDynamicTab;
  activeTabId: string;
  api: ApiClient;
  root: string;
  surfaceActive: boolean;
  onBrowserTabChange: (
    updater: (
      current: WorkspaceToolSurfaceSnapshot,
    ) => WorkspaceToolSurfaceSnapshot,
  ) => void;
  onOpenFile: (path: string) => void;
}) {
  if (activeTabId === workspaceToolFilesTabId) {
    return <WorkspaceWideFilesPanel api={api} root={root} />;
  }
  if (activeTabId === workspaceToolGitTabId) {
    return <WorkspaceWideGitPanel api={api} root={root} />;
  }

  return (
    <WorkspaceToolContent
      activeDynamicTab={activeDynamicTab}
      activeTabId={activeTabId}
      api={api}
      root={root}
      surfaceActive={surfaceActive}
      onBrowserTabChange={onBrowserTabChange}
      onOpenFile={onOpenFile}
    />
  );
}

function useWorkspaceWideFileOpener(api: ApiClient) {
  const queryClient = useQueryClient();
  const openWideFile = useWorkspaceToolStore((state) => state.openWideFile);
  const setWideFileReadError = useWorkspaceToolStore(
    (state) => state.setWideFileReadError,
  );
  const setWideFileReadResult = useWorkspaceToolStore(
    (state) => state.setWideFileReadResult,
  );

  return useCallback(
    ({ path, root }: { path: string; root: string }) => {
      const fileStates =
        useWorkspaceToolStore.getState().wideFilesByRoot[root]?.fileStates;
      const currentState =
        fileStates !== undefined && Object.hasOwn(fileStates, path)
          ? fileStates[path]
          : undefined;

      openWideFile({ path, root });
      if (currentState !== undefined && currentState.status !== "error") {
        return;
      }

      void queryClient
        .fetchQuery({
          queryFn: async () => api.workspaceTools.readFile({ path, root }),
          queryKey: queryKeys.workspaceTools.readFile(root, path),
          retry: false,
          staleTime: 5_000,
        })
        .then((result) => {
          setWideFileReadResult({ result, root });
        })
        .catch((error: unknown) => {
          setWideFileReadError({
            message: getErrorMessage(error),
            path,
            root,
          });
        });
    },
    [
      api,
      openWideFile,
      queryClient,
      setWideFileReadError,
      setWideFileReadResult,
    ],
  );
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
  const { model, treeQuery } = useWorkspaceFileTreeModel(api, root);
  const handleFileTreeClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const path = getFileTreePathFromEvent(event);
      if (is.nonEmptyString(path)) {
        onOpenFile(path);
      }
    },
    [onOpenFile],
  );
  const handleFileTreeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const path = getFileTreePathFromEvent(event);
      if (!is.nonEmptyString(path)) {
        return;
      }
      event.preventDefault();
      onOpenFile(path);
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
        onKeyDown={handleFileTreeKeyDown}
        role="presentation"
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

function WorkspaceWideFilesPanel({
  api,
  root,
}: {
  api: ApiClient;
  root: string;
}) {
  const queryClient = useQueryClient();
  const closeWideFile = useWorkspaceToolStore((state) => state.closeWideFile);
  const selectWideFile = useWorkspaceToolStore((state) => state.selectWideFile);
  const setWideFileDraftContent = useWorkspaceToolStore(
    (state) => state.setWideFileDraftContent,
  );
  const setWideFileSavedContent = useWorkspaceToolStore(
    (state) => state.setWideFileSavedContent,
  );
  const setWideFilesEditorDirty = useWorkspaceToolStore(
    (state) => state.setWideFilesEditorDirty,
  );
  const wideFilesState = useWorkspaceToolStore(
    (state) => state.wideFilesByRoot[root] ?? emptyWorkspaceWideFilesState,
  );
  const { model, treeQuery } = useWorkspaceFileTreeModel(api, root);
  const openWorkspaceWideFile = useWorkspaceWideFileOpener(api);
  const { activePath, fileStates, openFilePaths } = wideFilesState;
  const [fileTreeWidth, setFileTreeWidth] = useState(288);
  const dirty = openFilePaths.some((path) =>
    isWorkspaceWideFileStateDirty(fileStates[path]),
  );
  const saveFileMutation = useMutation({
    mutationFn: async (input: { content: string; path: string }) =>
      api.workspaceTools.writeFile({
        content: input.content,
        path: input.path,
        root,
      }),
  });

  useEffect(() => {
    setWideFilesEditorDirty(dirty);
    return () => {
      setWideFilesEditorDirty(false);
    };
  }, [dirty, setWideFilesEditorDirty]);

  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirty]);

  const handleFileTreeClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const path = getFileTreePathFromEvent(event);
      if (!is.nonEmptyString(path)) return;
      openWorkspaceWideFile({ path, root });
    },
    [openWorkspaceWideFile, root],
  );
  const handleFileTreeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const path = getFileTreePathFromEvent(event);
      if (!is.nonEmptyString(path)) {
        return;
      }
      event.preventDefault();
      openWorkspaceWideFile({ path, root });
    },
    [openWorkspaceWideFile, root],
  );
  const saveFile = useCallback(
    async (path: string) => {
      const state = fileStates[path];
      if (
        !isWorkspaceWideFileStateDirty(state) ||
        state.status !== "text" ||
        saveFileMutation.isPending
      ) {
        return true;
      }

      try {
        const result = await saveFileMutation.mutateAsync({
          content: state.draftContent,
          path,
        });
        setWideFileSavedContent({
          content: state.draftContent,
          path,
          root,
          size: result.size,
        });
        queryClient.setQueryData<WorkspaceFileReadResult>(
          queryKeys.workspaceTools.readFile(root, path),
          {
            content: state.draftContent,
            path,
            root,
            size: result.size,
            type: "text",
          },
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceTools.fileTree(root),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceTools.gitDiff(root),
        });
        return true;
      } catch {
        return false;
      }
    },
    [fileStates, queryClient, root, saveFileMutation, setWideFileSavedContent],
  );
  const saveActiveFile = useCallback(() => {
    if (!is.nonEmptyString(activePath)) return;
    void saveFile(activePath);
  }, [activePath, saveFile]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "s" ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      saveActiveFile();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [saveActiveFile]);
  const closeFile = useCallback(
    async (path: string) => {
      const state = fileStates[path];
      if (isWorkspaceWideFileStateDirty(state)) {
        const action =
          await window.desktopWindow.confirmSaveWorkspaceFileChanges({ path });
        if (action === "cancel") {
          return;
        }
        if (action === "save") {
          const saved = await saveFile(path);
          if (!saved) {
            return;
          }
        }
      }

      closeWideFile({ path, root });
    },
    [closeWideFile, fileStates, root, saveFile],
  );
  const updateActiveFileContent = useCallback(
    (content: string) => {
      if (!is.nonEmptyString(activePath)) return;
      setWideFileDraftContent({
        content,
        path: activePath,
        root,
      });
    },
    [activePath, root, setWideFileDraftContent],
  );
  const selectFile = useCallback(
    (path: string) => {
      selectWideFile({ path, root });
    },
    [root, selectWideFile],
  );
  const startFileTreeResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = fileTreeWidth;
      const handlePointerMove = (moveEvent: PointerEvent) => {
        setFileTreeWidth(
          Math.min(520, Math.max(200, startWidth + moveEvent.clientX - startX)),
        );
      };
      const stopResize = () => {
        window.removeEventListener("pointermove", handlePointerMove);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResize, { once: true });
    },
    [fileTreeWidth],
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
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex shrink-0 flex-col" style={{ width: fileTreeWidth }}>
        {treeQuery.data?.truncated ? (
          <div className="shrink-0 px-3 py-2 text-xs text-muted-foreground">
            Limited result set
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          onClick={handleFileTreeClick}
          onKeyDown={handleFileTreeKeyDown}
          role="presentation"
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
      <div
        aria-orientation="vertical"
        className="
          w-1 shrink-0 cursor-col-resize border-x border-transparent
          bg-border/70
          hover:bg-ring/50
        "
        role="separator"
        onPointerDown={startFileTreeResize}
      />
      <div className="min-w-0 flex-1">
        <WorkspaceWideFileEditor
          activePath={activePath}
          fileStates={fileStates}
          openFilePaths={openFilePaths}
          onClose={(path) => {
            void closeFile(path);
          }}
          onContentChange={updateActiveFileContent}
          onSelect={selectFile}
        />
      </div>
    </div>
  );
}

function useWorkspaceFileTreeModel(api: ApiClient, root: string) {
  const { model } = useFileTree({
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    icons: { colored: true, set: "complete" },
    id: `workspace-file-tree-${root}`,
    initialExpansion: 0,
    initialVisibleRowCount: 32,
    paths: [],
    search: false,
  });
  const treeQuery = useQuery({
    queryFn: async () => api.workspaceTools.fileTree({ root }),
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

  return { model, treeQuery };
}

function WorkspaceWideFileEditor({
  activePath,
  fileStates,
  openFilePaths,
  onClose,
  onContentChange,
  onSelect,
}: {
  activePath: string | null;
  fileStates: Record<string, WorkspaceWideFileState>;
  openFilePaths: string[];
  onClose: (path: string) => void;
  onContentChange: (content: string) => void;
  onSelect: (path: string) => void;
}) {
  const [editorTheme, setEditorTheme] = useState(getWorkspaceMonacoTheme);
  useEffect(() => {
    const updateTheme = () => {
      setEditorTheme(getWorkspaceMonacoTheme());
    };
    const themeObserver = new MutationObserver(updateTheme);

    themeObserver.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });

    return () => {
      themeObserver.disconnect();
    };
  }, []);

  if (openFilePaths.length === 0 || !is.nonEmptyString(activePath)) {
    return <WorkspaceToolEmpty title="Select a file" />;
  }

  const activeState = fileStates[activePath] ?? { status: "loading" };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <WorkspaceWideFileTabBar
        activePath={activePath}
        fileStates={fileStates}
        openFilePaths={openFilePaths}
        onClose={onClose}
        onSelect={onSelect}
      />
      {activeState.status === "loading" ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-[70vh] w-full rounded-md" />
        </div>
      ) : activeState.status === "error" ? (
        <WorkspaceToolEmpty
          detail={activeState.message}
          title="File unavailable"
        />
      ) : activeState.status === "unsupported" ? (
        <WorkspaceToolEmpty
          detail={formatUnsupportedFileReason(activeState.result)}
          title={activeState.result.path}
        />
      ) : (
        <Suspense
          fallback={
            <div className="space-y-3 p-4">
              <Skeleton className="h-[70vh] w-full rounded-md" />
            </div>
          }
        >
          <WorkspaceMonacoEditor
            className="min-h-0 flex-1"
            defaultLanguage={getWorkspaceMonacoLanguageFromFileTree(activePath)}
            path={activePath}
            theme={editorTheme}
            value={activeState.draftContent}
            options={workspaceMonacoDisplayEditorOptions}
            onChange={(value) => onContentChange(value ?? "")}
          />
        </Suspense>
      )}
    </div>
  );
}

function WorkspaceWideFileTabBar({
  activePath,
  fileStates,
  openFilePaths,
  onClose,
  onSelect,
}: {
  activePath: string;
  fileStates: Record<string, WorkspaceWideFileState>;
  openFilePaths: string[];
  onClose: (path: string) => void;
  onSelect: (path: string) => void;
}) {
  return (
    <div
      className="
        flex h-9 shrink-0 items-stretch border-b border-border/70 bg-muted/30
        text-xs
      "
      style={workspaceFileTreeIconColorStyle}
    >
      <WorkspaceFileTreeIconSprite />
      <div className="flex min-w-0 flex-1 overflow-x-auto">
        {openFilePaths.map((path) => {
          const active = path === activePath;
          const dirty = isWorkspaceWideFileStateDirty(fileStates[path]);
          const fileName = basename(path);

          return (
            <div
              className={cn(
                `
                  group/tab flex h-9 max-w-80 min-w-32 items-center gap-2
                  border-r border-border/70 px-3 text-muted-foreground
                `,
                active ? "bg-background text-foreground" : "hover:bg-muted/60",
              )}
              key={path}
              title={path}
            >
              <button
                aria-selected={active}
                className="
                  flex h-full min-w-0 flex-1 items-center gap-2 text-left
                  outline-none
                  focus-visible:ring-2 focus-visible:ring-ring/30
                "
                onClick={() => onSelect(path)}
                role="tab"
                type="button"
              >
                <WorkspaceFileTreeFileIcon path={path} />
                <span className="min-w-0 truncate">{fileName}</span>
              </button>
              <button
                aria-label={`Close ${fileName}`}
                className="
                  ml-1 flex size-5 shrink-0 items-center justify-center
                  rounded-sm text-muted-foreground outline-none
                  hover:bg-muted hover:text-foreground
                  focus-visible:ring-2 focus-visible:ring-ring/30
                "
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(path);
                }}
                title={`Close ${fileName}`}
                type="button"
              >
                {dirty ? (
                  <>
                    <span
                      className="
                        size-2 rounded-full bg-muted-foreground
                        group-hover/tab:hidden
                      "
                    />
                    <Close
                      className="
                        hidden size-3.5
                        group-hover/tab:block
                      "
                    />
                  </>
                ) : (
                  <Close className="size-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
      <div className="min-w-0 flex-1" />
    </div>
  );
}

function WorkspaceFileTreeIconSprite() {
  const spriteRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const spriteNode = spriteRef.current;
    if (!spriteNode) return;

    const template = document.createElement("template");
    template.innerHTML = workspaceFileTreeIconSpriteSheet.trim();
    spriteNode.replaceChildren(template.content.cloneNode(true));
  }, []);

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-0 overflow-hidden"
      ref={spriteRef}
    />
  );
}

function WorkspaceFileTreeFileIcon({ path }: { path: string }) {
  const icon = workspaceFileIconResolver.resolveIcon(
    "file-tree-icon-file",
    path,
  );
  const name = icon.name.replace(/^#/, "");
  const token = icon.token ?? "default";
  const width = icon.width ?? 16;
  const height = icon.height ?? 16;

  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      data-icon-name={icon.remappedFrom ?? icon.name}
      data-icon-token={token}
      fill="currentColor"
      height={height}
      style={{
        color: `var(--trees-file-icon-color-${token}, var(--trees-file-icon-color-default))`,
      }}
      viewBox={icon.viewBox ?? `0 0 ${width} ${height}`}
      width={width}
    >
      <use href={`#${name}`} />
    </svg>
  );
}

function useWorkspaceGitPanelState(api: ApiClient, root: string) {
  const queryClient = useQueryClient();
  const [commitDescription, setCommitDescription] = useState("");
  const [commitSummary, setCommitSummary] = useState("");
  const [selectedFileKeys, setSelectedFileKeys] = useState<
    Record<string, boolean>
  >({});
  const commitMutation = useMutation({
    mutationFn: async (input: {
      description?: string;
      paths: string[];
      root: string;
      summary: string;
    }) => api.workspaceTools.gitCommit(input),
    onSuccess: () => {
      setCommitDescription("");
      setCommitSummary("");
      setSelectedFileKeys({});
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceTools.gitDiff(root),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceTools.fileTree(root),
      });
    },
  });
  const gitQuery = useQuery({
    queryFn: async () => api.workspaceTools.gitDiff({ root }),
    queryKey: queryKeys.workspaceTools.gitDiff(root),
    retry: false,
    staleTime: 5_000,
  });
  const handleFileSelectedChange = useCallback(
    (file: WorkspaceToolPatchFile, selected: boolean) => {
      setSelectedFileKeys((current) => ({
        ...current,
        [file.key]: selected,
      }));
    },
    [],
  );
  const commitSelectedPaths = useCallback(
    (paths: string[]) => {
      const summary = commitSummary.trim();
      if (!summary || paths.length === 0 || commitMutation.isPending) {
        return;
      }

      const description = commitDescription.trim();
      commitMutation.mutate({
        description: description || undefined,
        paths,
        root,
        summary,
      });
    },
    [commitDescription, commitMutation, commitSummary, root],
  );

  return {
    commitDescription,
    commitMutation,
    commitSelectedPaths,
    commitSummary,
    gitQuery,
    handleFileSelectedChange,
    selectedFileKeys,
    setCommitDescription,
    setCommitSummary,
  };
}

function WorkspaceGitPanel({ api, root }: { api: ApiClient; root: string }) {
  const {
    commitDescription,
    commitMutation,
    commitSelectedPaths,
    commitSummary,
    gitQuery,
    handleFileSelectedChange,
    selectedFileKeys,
    setCommitDescription,
    setCommitSummary,
  } = useWorkspaceGitPanelState(api, root);

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
  const selectedFiles = patchList.files.filter(
    (file) => selectedFileKeys[file.key] ?? true,
  );
  const selectedPaths = selectedFiles.map((file) => file.name);
  const handleCommitSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitSelectedPaths(selectedPaths);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        {data.warnings.length > 0 ? (
          <div
            className="
              m-3 space-y-1 rounded-md border border-border/70 bg-muted/30 p-2
              text-xs text-muted-foreground
            "
          >
            {data.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
        <WorkspaceToolPatchFileList
          flush
          patchList={patchList}
          selectedFileKeys={selectedFileKeys}
          onFileSelectedChange={handleFileSelectedChange}
        />
      </div>
      <WorkspaceGitCommitComposer
        branch={data.branch}
        description={commitDescription}
        errorMessage={
          commitMutation.isError
            ? getErrorMessage(commitMutation.error)
            : undefined
        }
        pending={commitMutation.isPending}
        selectedCount={selectedFiles.length}
        summary={commitSummary}
        totalCount={patchList.files.length}
        onDescriptionChange={setCommitDescription}
        onSubmit={handleCommitSubmit}
        onSummaryChange={setCommitSummary}
      />
    </div>
  );
}

function WorkspaceWideGitPanel({
  api,
  root,
}: {
  api: ApiClient;
  root: string;
}) {
  const {
    commitDescription,
    commitMutation,
    commitSelectedPaths,
    commitSummary,
    gitQuery,
    handleFileSelectedChange,
    selectedFileKeys,
    setCommitDescription,
    setCommitSummary,
  } = useWorkspaceGitPanelState(api, root);
  const [activeFileKey, setActiveFileKey] = useState<string | null>(null);

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
      <div className="flex h-full min-h-0 bg-background">
        <div className="w-80 shrink-0 border-r border-border/70 p-3">
          <Skeleton className="h-8 w-full rounded-md" />
          <Skeleton className="mt-3 h-48 w-full rounded-md" />
        </div>
        <div className="min-w-0 flex-1 p-3">
          <Skeleton className="h-8 w-64 rounded-md" />
          <Skeleton className="mt-3 h-[70vh] w-full rounded-md" />
        </div>
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
  const selectedFiles = patchList.files.filter(
    (file) => selectedFileKeys[file.key] ?? true,
  );
  const selectedPaths = selectedFiles.map((file) => file.name);
  const activeFile =
    patchList.files.find((file) => file.key === activeFileKey) ??
    patchList.files[0];
  const handleCommitSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitSelectedPaths(selectedPaths);
  };

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex w-80 shrink-0 flex-col border-r border-border/70">
        <div className="min-h-0 flex-1 overflow-auto">
          {data.warnings.length > 0 ? (
            <div
              className="
                m-3 space-y-1 rounded-md border border-border/70 bg-muted/30 p-2
                text-xs text-muted-foreground
              "
            >
              {data.warnings.map((warning) => (
                <div key={warning}>{warning}</div>
              ))}
            </div>
          ) : null}
          <WorkspaceToolPatchFileList
            flush
            activeFileKey={activeFile?.key}
            patchList={patchList}
            rowMode="select"
            selectedFileKeys={selectedFileKeys}
            onFileActivate={(file) => setActiveFileKey(file.key)}
            onFileSelectedChange={handleFileSelectedChange}
          />
        </div>
        <WorkspaceGitCommitComposer
          branch={data.branch}
          description={commitDescription}
          errorMessage={
            commitMutation.isError
              ? getErrorMessage(commitMutation.error)
              : undefined
          }
          pending={commitMutation.isPending}
          selectedCount={selectedFiles.length}
          summary={commitSummary}
          totalCount={patchList.files.length}
          onDescriptionChange={setCommitDescription}
          onSubmit={handleCommitSubmit}
          onSummaryChange={setCommitSummary}
        />
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <WorkspaceWideGitDiffViewer file={activeFile} />
      </div>
    </div>
  );
}

function WorkspaceWideGitDiffViewer({
  file,
}: {
  file?: WorkspaceToolPatchFile;
}) {
  if (!file) {
    return <WorkspaceToolEmpty title="No changes" />;
  }

  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineChanges = getWorkspaceToolPatchFileLineChanges(file);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className="
          flex h-8 shrink-0 items-center gap-2 border-b border-border/70 px-3
          text-xs
        "
      >
        <span className="min-w-0 flex-1 truncate font-medium" title={fileName}>
          {fileName}
        </span>
        <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <WorkspaceToolPatchFileDiffContent file={file} />
      </div>
    </div>
  );
}

function WorkspaceGitCommitComposer({
  branch,
  description,
  errorMessage,
  pending,
  selectedCount,
  summary,
  totalCount,
  onDescriptionChange,
  onSubmit,
  onSummaryChange,
}: {
  branch?: string;
  description: string;
  errorMessage?: string;
  pending: boolean;
  selectedCount: number;
  summary: string;
  totalCount: number;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onSummaryChange: (value: string) => void;
}) {
  const disabled =
    pending || selectedCount === 0 || summary.trim().length === 0;
  const target = is.nonEmptyString(branch) ? branch : "HEAD";

  return (
    <form
      className="shrink-0 border-t border-border/70 bg-background p-2"
      onSubmit={onSubmit}
    >
      <div className="space-y-1.5">
        <Input
          className="
            h-6 rounded-md bg-muted/40 px-2 py-0.5 text-[11px]/4
            md:text-[11px]
          "
          placeholder="Summary"
          value={summary}
          onChange={(event) => onSummaryChange(event.currentTarget.value)}
        />
        <Textarea
          className="
            min-h-12 rounded-md bg-muted/40 p-1.5 text-[11px]/4
            md:text-[11px]
          "
          placeholder="Description"
          value={description}
          onChange={(event) => onDescriptionChange(event.currentTarget.value)}
        />
        {is.nonEmptyString(errorMessage) ? (
          <div
            className="
              rounded-md border border-destructive/40 bg-destructive/5 px-2
              py-1.5 text-[11px] text-destructive
            "
          >
            {errorMessage}
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <div
            className="
              min-w-0 flex-1 truncate text-[11px] text-muted-foreground
            "
          >
            {selectedCount.toLocaleString()} of {totalCount.toLocaleString()}{" "}
            files selected
          </div>
          <Button disabled={disabled} size="xs" type="submit">
            {pending ? "Committing" : `Commit to ${target}`}
          </Button>
        </div>
      </div>
    </form>
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
    queryFn: async () =>
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
    queryFn: async () => api.workspaceTools.gitDiff({ root: tab.root }),
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
      .catch((error: unknown) => {
        console.error("Failed to get workspace browser state.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [tab.browserViewId, tab.id]);

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
        .catch((error: unknown) => {
          console.error("Failed to navigate workspace browser.", {
            browserViewId: tab.browserViewId,
            error,
            tabId: tab.id,
            url: nextUrl,
          });
        });
    },
    [
      handleStateChange,
      tab.browserViewId,
      tab.draftUrl,
      tab.id,
      updateBrowserTab,
    ],
  );
  const goBack = useCallback(() => {
    void window.workspaceBrowser
      .goBack({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch((error: unknown) => {
        console.error("Failed to navigate workspace browser back.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [handleStateChange, tab.browserViewId, tab.id]);
  const goForward = useCallback(() => {
    void window.workspaceBrowser
      .goForward({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch((error: unknown) => {
        console.error("Failed to navigate workspace browser forward.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [handleStateChange, tab.browserViewId, tab.id]);
  const reload = useCallback(() => {
    void window.workspaceBrowser
      .reload({ browserViewId: tab.browserViewId })
      .then(handleStateChange)
      .catch((error: unknown) => {
        console.error("Failed to reload workspace browser.", {
          browserViewId: tab.browserViewId,
          error,
          tabId: tab.id,
        });
      });
  }, [handleStateChange, tab.browserViewId, tab.id]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        className="
          flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-2
        "
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
        key={tab.browserViewId}
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
      <div
        className="
          flex h-9 shrink-0 items-center gap-2 border-b border-border/70 px-3
          text-xs text-muted-foreground
        "
      >
        <span className="min-w-0 flex-1 truncate" title={result.path}>
          {result.path}
        </span>
        <span>{formatBytes(result.size)}</span>
      </div>
      <pre
        className="
          min-h-0 flex-1 overflow-auto p-4 font-mono text-xs/5 whitespace-pre
          text-foreground
        "
      >
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
  const files = is.nonEmptyString(pathFilter)
    ? patchList.files.filter((file) => file.name === pathFilter)
    : patchList.files;

  return (
    <div className="h-full min-h-0 overflow-auto p-3">
      {data.warnings.length > 0 ? (
        <div
          className="
            mb-3 space-y-1 rounded-md border border-border/70 bg-muted/30 p-2
            text-xs text-muted-foreground
          "
        >
          {data.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
      {patchList.errors.map((error) => (
        <div
          className="
            mb-2 rounded-md border border-destructive/40 bg-destructive/5 px-3
            py-2 text-xs text-destructive
          "
          key={error}
        >
          {error}
        </div>
      ))}
      {files.length > 0 ? (
        <WorkspaceToolPatchFileRows files={files} />
      ) : (
        <WorkspaceToolEmpty
          detail={pathFilter}
          title={
            is.nonEmptyString(pathFilter) ? "No diff for file" : "No changes"
          }
        />
      )}
    </div>
  );
}

function WorkspaceToolPatchFileList({
  activeFileKey,
  flush = false,
  onFileActivate,
  onFileSelectedChange,
  patchList,
  rowMode = "expand",
  selectedFileKeys,
}: {
  activeFileKey?: string;
  flush?: boolean;
  onFileActivate?: (file: WorkspaceToolPatchFile) => void;
  onFileSelectedChange?: (
    file: WorkspaceToolPatchFile,
    selected: boolean,
  ) => void;
  patchList: {
    errors: string[];
    files: WorkspaceToolPatchFile[];
  };
  rowMode?: "expand" | "select";
  selectedFileKeys?: Record<string, boolean>;
}) {
  return (
    <section className="space-y-2">
      {patchList.errors.map((error) => (
        <div
          className="
            rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2
            text-xs text-destructive
          "
          key={error}
        >
          {error}
        </div>
      ))}
      {patchList.files.length > 0 ? (
        <WorkspaceToolPatchFileRows
          activeFileKey={activeFileKey}
          files={patchList.files}
          flush={flush}
          rowMode={rowMode}
          selectedFileKeys={selectedFileKeys}
          onFileActivate={onFileActivate}
          onFileSelectedChange={onFileSelectedChange}
        />
      ) : patchList.errors.length === 0 ? (
        <div className="px-3 py-6 text-center text-sm text-muted-foreground">
          No changes
        </div>
      ) : null}
    </section>
  );
}

function WorkspaceToolPatchFileRows({
  activeFileKey,
  files,
  flush = false,
  onFileActivate,
  onFileSelectedChange,
  rowMode = "expand",
  selectedFileKeys: controlledSelectedFileKeys,
}: {
  activeFileKey?: string;
  files: WorkspaceToolPatchFile[];
  flush?: boolean;
  onFileActivate?: (file: WorkspaceToolPatchFile) => void;
  onFileSelectedChange?: (
    file: WorkspaceToolPatchFile,
    selected: boolean,
  ) => void;
  rowMode?: "expand" | "select";
  selectedFileKeys?: Record<string, boolean>;
}) {
  const [localSelectedFileKeys, setLocalSelectedFileKeys] = useState<
    Record<string, boolean>
  >({});
  const selectedFileKeys = controlledSelectedFileKeys ?? localSelectedFileKeys;
  const handleFileSelectedChange = (
    file: WorkspaceToolPatchFile,
    selected: boolean,
  ) => {
    if (onFileSelectedChange) {
      onFileSelectedChange(file, selected);
      return;
    }
    setLocalSelectedFileKeys((current) => ({
      ...current,
      [file.key]: selected,
    }));
  };

  return (
    <div
      className={cn(
        "overflow-hidden bg-background",
        flush ? "" : "rounded-md border border-border/70",
      )}
    >
      {files.map((file) => (
        <WorkspaceToolPatchFileItem
          active={file.key === activeFileKey}
          checked={selectedFileKeys[file.key] ?? true}
          file={file}
          key={file.key}
          mode={rowMode}
          onActivate={onFileActivate}
          onCheckedChange={handleFileSelectedChange}
        />
      ))}
    </div>
  );
}

function WorkspaceToolPatchFileItem({
  active = false,
  checked,
  file,
  mode,
  onActivate,
  onCheckedChange,
}: {
  active?: boolean;
  checked: boolean;
  file: WorkspaceToolPatchFile;
  mode: "expand" | "select";
  onActivate?: (file: WorkspaceToolPatchFile) => void;
  onCheckedChange: (file: WorkspaceToolPatchFile, checked: boolean) => void;
}) {
  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineChanges = getWorkspaceToolPatchFileLineChanges(file);
  const [open, setOpen] = useState(false);

  if (mode === "select") {
    return (
      <div
        className={cn(
          `
            border-b border-border/70
            last:border-b-0
          `,
          active ? "bg-muted/60" : "",
        )}
      >
        <div
          className="
            group flex min-h-8 w-full items-center gap-2 px-2.5 py-1 text-xs
            transition-colors
            hover:bg-muted/50
          "
        >
          <Checkbox
            aria-label={`Include ${fileName} in commit`}
            checked={checked}
            className="size-3.5"
            onCheckedChange={(value) => onCheckedChange(file, value === true)}
          />
          <button
            aria-current={active ? "true" : undefined}
            className="
              flex min-w-0 flex-1 items-center gap-2 text-left outline-none
              focus-visible:ring-2 focus-visible:ring-ring/30
            "
            type="button"
            onClick={() => onActivate?.(file)}
          >
            <span
              className="min-w-0 flex-1 truncate font-medium text-foreground"
              title={fileName}
            >
              {fileName}
            </span>
          </button>
          <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
        </div>
      </div>
    );
  }

  return (
    <Collapsible
      className="
        border-b border-border/70
        last:border-b-0
      "
      open={open}
      onOpenChange={setOpen}
    >
      <div
        className="
          group flex min-h-8 w-full items-center gap-2 px-2.5 py-1 text-xs
          transition-colors
          hover:bg-muted/50
        "
      >
        <Checkbox
          aria-label={`Include ${fileName} in commit`}
          checked={checked}
          className="size-3.5"
          onCheckedChange={(value) => onCheckedChange(file, value === true)}
        />
        <CollapsibleTrigger
          className="
            flex min-w-0 flex-1 items-center gap-2 text-left outline-none
            focus-visible:ring-2 focus-visible:ring-ring/30
          "
          type="button"
        >
          <span
            className="min-w-0 flex-1 truncate font-medium text-foreground"
            title={fileName}
          >
            {fileName}
          </span>
        </CollapsibleTrigger>
        <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
      </div>
      {open ? (
        <CollapsibleContent
          className="
            overflow-hidden
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
          "
        >
          <WorkspaceToolPatchFileDiffContent file={file} borderTop />
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function WorkspaceToolPatchFileDiffContent({
  borderTop = false,
  file,
}: {
  borderTop?: boolean;
  file: WorkspaceToolPatchFile;
}) {
  return (
    <div className={cn(borderTop ? "border-t border-border/70" : "")}>
      {file.diffs.map((diff, index) => (
        <div
          className="
            overflow-hidden border-b border-border/70
            last:border-b-0
          "
          key={workspaceToolFileDiffKey(diff.source, diff.fileDiff, index)}
        >
          {file.diffs.length > 1 ? (
            <div
              className="
                border-b border-border/70 px-2.5 py-1 text-[11px] font-medium
                text-muted-foreground
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

function WorkspaceToolPatchFileLineStats({
  lineChanges,
}: {
  lineChanges: WorkspaceToolPatchFileLineChanges;
}) {
  if (lineChanges.additions === 0 && lineChanges.deletions === 0) {
    return null;
  }

  return (
    <span className="flex shrink-0 items-center gap-2 text-[11px] tabular-nums">
      {lineChanges.additions > 0 ? (
        <span
          className="
            font-medium text-emerald-600
            dark:text-emerald-400
          "
        >
          +{lineChanges.additions.toLocaleString()}
        </span>
      ) : null}
      {lineChanges.deletions > 0 ? (
        <span
          className="
            font-medium text-red-600
            dark:text-red-400
          "
        >
          -{lineChanges.deletions.toLocaleString()}
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

function WorkspaceToolEmpty({
  detail,
  title,
}: {
  detail?: string;
  title: string;
}) {
  return (
    <div
      className="
        flex h-full min-h-0 items-center justify-center p-4 text-center
      "
    >
      <div className="max-w-80 space-y-1">
        <div className="text-sm font-medium">{title}</div>
        {is.nonEmptyString(detail) ? (
          <div className="text-xs wrap-break-word text-muted-foreground">
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

function getFileTreePathFromEvent(
  event: ReactKeyboardEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
) {
  const directTarget =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          "[data-item-path][data-item-type='file']",
        )
      : null;
  const directTargetPath = directTarget?.dataset.itemPath;
  if (is.nonEmptyString(directTargetPath)) {
    return directTargetPath;
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

async function confirmWorkspaceWideFilesExit({
  api,
  queryClient,
  root,
}: {
  api: ApiClient;
  queryClient: QueryClient;
  root: string | null;
}) {
  if (!is.nonEmptyString(root)) {
    return true;
  }

  let didWriteFile = false;
  for (const path of getDirtyWorkspaceWideFilePaths(root)) {
    const state =
      useWorkspaceToolStore.getState().wideFilesByRoot[root]?.fileStates[path];
    if (!isWorkspaceWideFileStateDirty(state) || state.status !== "text") {
      continue;
    }

    const action = await window.desktopWindow.confirmSaveWorkspaceFileChanges({
      path,
    });
    if (action === "cancel") {
      return false;
    }
    if (action === "discard") {
      useWorkspaceToolStore.getState().setWideFileDraftContent({
        content: state.savedContent,
        path,
        root,
      });
      continue;
    }

    try {
      const result = await api.workspaceTools.writeFile({
        content: state.draftContent,
        path,
        root,
      });
      didWriteFile = true;
      useWorkspaceToolStore.getState().setWideFileSavedContent({
        content: state.draftContent,
        path,
        root,
        size: result.size,
      });
      queryClient.setQueryData<WorkspaceFileReadResult>(
        queryKeys.workspaceTools.readFile(root, path),
        {
          content: state.draftContent,
          path,
          root,
          size: result.size,
          type: "text",
        },
      );
    } catch (error: unknown) {
      console.error("Failed to save workspace file before leaving editor.", {
        error,
        path,
        root,
      });
      return false;
    }
  }

  if (didWriteFile) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.fileTree(root),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.gitDiff(root),
    });
  }

  if (getDirtyWorkspaceWideFilePaths(root).length === 0) {
    useWorkspaceToolStore.getState().setWideFilesEditorDirty(false);
  }
  return true;
}

function getDirtyWorkspaceWideFilePaths(root: string) {
  const wideFilesByRoot = useWorkspaceToolStore.getState().wideFilesByRoot;
  if (!Object.hasOwn(wideFilesByRoot, root)) {
    return [];
  }
  const wideFilesState = wideFilesByRoot[root];

  return wideFilesState.openFilePaths.filter((path) =>
    isWorkspaceWideFileStateDirty(wideFilesState.fileStates[path]),
  );
}

function getWorkspaceMonacoLanguageFromFileTree(path: string) {
  const token = workspaceFileIconResolver.resolveIcon(
    "file-tree-icon-file",
    path,
  ).token;

  return (
    (is.nonEmptyString(token)
      ? workspaceMonacoLanguageByFileTreeToken[token]
      : undefined) ?? "plaintext"
  );
}

function getWorkspaceMonacoTheme() {
  return document.documentElement.classList.contains("dark")
    ? workspaceMonacoThemeDark
    : workspaceMonacoThemeLight;
}

function disableWorkspaceMonacoTypeScriptServices(
  monacoModule: Awaited<ReturnType<typeof loadWorkspaceMonacoModule>>,
) {
  const modeConfiguration = {
    codeActions: false,
    completionItems: false,
    definitions: false,
    diagnostics: false,
    documentHighlights: false,
    documentRangeFormattingEdits: false,
    documentSymbols: false,
    hovers: false,
    inlayHints: false,
    onTypeFormattingEdits: false,
    references: false,
    rename: false,
    signatureHelp: false,
  };
  const diagnosticsOptions = {
    noSemanticValidation: true,
    noSuggestionDiagnostics: true,
    noSyntaxValidation: true,
  };

  monacoModule.typescript.typescriptDefaults.setDiagnosticsOptions(
    diagnosticsOptions,
  );
  monacoModule.typescript.javascriptDefaults.setDiagnosticsOptions(
    diagnosticsOptions,
  );
  monacoModule.typescript.typescriptDefaults.setModeConfiguration(
    modeConfiguration,
  );
  monacoModule.typescript.javascriptDefaults.setModeConfiguration(
    modeConfiguration,
  );
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
      is.nonEmptyString(error) ? [error] : [],
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
  return is.nonEmptyString(file.prevName)
    ? `${file.prevName} -> ${file.name}`
    : file.name;
}

function formatWorkspaceToolPatchSource(source: WorkspaceToolPatchSource) {
  return source === "staged" ? "Staged" : "Unstaged";
}

function getWorkspaceToolPatchFileLineChanges(
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
    case "not-file":
      return "Not a file";
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
