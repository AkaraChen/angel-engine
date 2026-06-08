import type { ApiClient } from "@/platform/api-client";
import type {
  WorkspaceFileReadResult,
  WorkspaceGitDiffResult,
} from "@shared/workspace-tools";
import type { WorkspaceToolInstance } from "@shared/workspace-tool-instances";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { CSSProperties } from "react";

import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import {
  RiCloseLine as Close,
  RiExternalLinkLine as ExternalLink,
  RiFileTextLine as FileText,
  RiGitBranchLine as GitBranch,
  RiGlobalLine as Browser,
  RiTerminalBoxLine as TerminalIcon,
  RiWindowLine as WindowIcon,
} from "@remixicon/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { WorkspaceBrowserToolView } from "@/app/workspace/workspace-browser-view";
import {
  ensureWorkspaceToolWindowEvents,
  useWorkspaceToolStore,
} from "@/app/workspace/workspace-tool-store";
import { WorkspaceTerminalView } from "@/app/workspace/workspace-terminal-view";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

const largeWorkspaceDiffLineThreshold = 1000;

type WorkspaceToolCssVariableStyle = CSSProperties &
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

export function WorkspaceToolContextBridge({ root }: { root?: string }) {
  const setWorkspaceToolRoot = useWorkspaceToolStore(
    (state) => state.setWorkspaceToolRoot,
  );
  const setBridge = useCallback(
    (node: HTMLSpanElement | null) => {
      if (!node) {
        return;
      }

      setWorkspaceToolRoot(root);
      window.desktopWindow.setWorkspaceToolContext({ root: root ?? null });
    },
    [root, setWorkspaceToolRoot],
  );

  return <span hidden ref={setBridge} />;
}

export function WorkspaceToolDialogHost({ api }: { api: ApiClient }) {
  ensureWorkspaceToolWindowEvents();
  const activeDialogToolId = useWorkspaceToolStore(
    (state) => state.activeDialogToolId,
  );
  const instances = useWorkspaceToolStore((state) => state.instances);
  const dialogInstances = useMemo(
    () =>
      Object.values(instances).filter((instance) => instance.host === "dialog"),
    [instances],
  );
  const instance =
    dialogInstances.find((instance) => instance.id === activeDialogToolId) ??
    dialogInstances[0];
  const closeWorkspaceTool = useWorkspaceToolStore(
    (state) => state.closeWorkspaceTool,
  );
  const closeDialogTools = useWorkspaceToolStore(
    (state) => state.closeDialogTools,
  );
  const setActiveDialogTool = useWorkspaceToolStore(
    (state) => state.setActiveDialogTool,
  );
  const setWorkspaceToolHost = useWorkspaceToolStore(
    (state) => state.setWorkspaceToolHost,
  );

  if (!instance) {
    return null;
  }

  const closeActiveTool = () => {
    closeWorkspaceTool(instance.id);
  };
  const openWindow = () => {
    const windowInstance = { ...instance, host: "window" as const };
    setWorkspaceToolHost(instance.id, "window");
    window.desktopWindow.openWorkspaceToolWindow({ instance: windowInstance });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && closeDialogTools()}>
      <DialogContent
        className="!flex h-[min(90vh,960px)] !w-[calc(100vw-24px)] !max-w-[calc(100vw-24px)] flex-row gap-0 overflow-hidden p-0 sm:!w-[calc(100vw-40px)] sm:!max-w-[calc(100vw-40px)]"
        showCloseButton={false}
      >
        <WorkspaceToolWorkbench
          activeToolId={instance.id}
          api={api}
          tools={dialogInstances}
          onCloseActiveTool={closeActiveTool}
          onCloseTool={closeWorkspaceTool}
          onOpenDialog={undefined}
          onOpenWindow={openWindow}
          onSelectTool={setActiveDialogTool}
        />
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceToolWorkbench({
  activeToolId,
  api,
  tools,
  onCloseActiveTool,
  onCloseTool,
  onOpenDialog,
  onOpenWindow,
  onSelectTool,
  trafficLightInset = false,
}: {
  activeToolId: string;
  api: ApiClient;
  tools: WorkspaceToolInstance[];
  onCloseActiveTool: () => void;
  onCloseTool: (toolId: string) => void;
  onOpenDialog?: () => void;
  onOpenWindow?: () => void;
  onSelectTool: (toolId: string) => void;
  trafficLightInset?: boolean;
}) {
  const activeTool = tools.find((tool) => tool.id === activeToolId) ?? tools[0];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden">
      <WorkspaceToolRail
        activeToolId={activeTool.id}
        trafficLightInset={trafficLightInset}
        tools={tools}
        onCloseTool={onCloseTool}
        onSelectTool={onSelectTool}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceToolHeader
          title={workspaceToolDisplayTitle(activeTool)}
          onClose={onCloseActiveTool}
          onOpenDialog={onOpenDialog}
          onOpenWindow={onOpenWindow}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <WorkspaceToolContent active api={api} instance={activeTool} />
        </div>
      </div>
    </div>
  );
}

function WorkspaceToolRail({
  activeToolId,
  trafficLightInset,
  tools,
  onCloseTool,
  onSelectTool,
}: {
  activeToolId: string;
  trafficLightInset: boolean;
  tools: WorkspaceToolInstance[];
  onCloseTool: (toolId: string) => void;
  onSelectTool: (toolId: string) => void;
}) {
  return (
    <aside className="flex w-[clamp(10rem,18vw,18rem)] shrink-0 flex-col border-r border-border/70 bg-muted/20">
      <div
        className={cn(
          "flex h-11 shrink-0 items-center border-b border-border/70 px-3 text-xs font-medium text-muted-foreground",
          trafficLightInset && "[-webkit-app-region:drag] pl-[88px]",
        )}
      >
        Tools
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {tools.map((tool) => {
            const active = tool.id === activeToolId;
            const Icon = workspaceToolIcon(tool);

            return (
              <div
                className={cn(
                  "group flex h-9 min-w-0 items-center overflow-hidden rounded-md border border-transparent text-xs text-muted-foreground",
                  active
                    ? "border-border/80 bg-background text-foreground shadow-sm"
                    : "hover:bg-background/70 hover:text-foreground",
                )}
                key={tool.id}
              >
                <button
                  className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left outline-none [-webkit-app-region:no-drag] focus-visible:ring-2 focus-visible:ring-ring/30"
                  onClick={() => onSelectTool(tool.id)}
                  title={workspaceToolDisplayTitle(tool)}
                  type="button"
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {workspaceToolDisplayTitle(tool)}
                  </span>
                </button>
                <button
                  aria-label={`Close ${tool.title}`}
                  className="flex h-full w-7 shrink-0 items-center justify-center text-muted-foreground/70 outline-none [-webkit-app-region:no-drag] hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTool(tool.id);
                  }}
                  title={`Close ${tool.title}`}
                  type="button"
                >
                  <Close className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

export function WorkspaceToolWindowPage({ toolId }: { toolId: string }) {
  ensureWorkspaceToolWindowEvents();
  const api = getApiClient();
  const trafficLightInset = window.desktopEnvironment.platform === "darwin";
  const storeInstance = useWorkspaceToolStore(
    (state) => state.instances[toolId],
  );
  const toolQuery = useQuery({
    queryFn: () => window.desktopWindow.getWorkspaceToolWindowInstance(toolId),
    queryKey: ["workspace-tool-window", toolId],
    retry: false,
    staleTime: Infinity,
  });
  const instance = storeInstance ?? toolQuery.data;

  if (toolQuery.isLoading) {
    return (
      <div className="flex h-screen min-h-0 flex-col bg-background">
        <WorkspaceToolHeader
          title="Loading"
          trafficLightInset={trafficLightInset}
        />
        <div className="space-y-3 p-4">
          <Skeleton className="h-8 w-52 rounded-md" />
          <Skeleton className="h-80 w-full rounded-md" />
        </div>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="flex h-screen min-h-0 flex-col bg-background">
        <WorkspaceToolHeader
          title="Tool unavailable"
          trafficLightInset={trafficLightInset}
        />
        <WorkspaceToolEmpty title="Tool unavailable" />
      </div>
    );
  }

  const openDialog = () => {
    window.desktopWindow.openWorkspaceToolDialog({
      instance: { ...instance, host: "dialog" },
    });
    window.desktopWindow.closeCurrent();
  };

  return (
    <div className="flex h-screen min-h-0 bg-background text-foreground">
      <WorkspaceToolWorkbench
        activeToolId={instance.id}
        api={api}
        tools={[instance]}
        onCloseActiveTool={() => window.desktopWindow.closeCurrent()}
        onCloseTool={() => window.desktopWindow.closeCurrent()}
        onOpenDialog={openDialog}
        onOpenWindow={undefined}
        onSelectTool={() => {}}
        trafficLightInset={trafficLightInset}
      />
    </div>
  );
}

function WorkspaceToolHeader({
  title,
  onClose,
  onOpenDialog,
  onOpenWindow,
  trafficLightInset = false,
}: {
  title: string;
  onClose?: () => void;
  onOpenDialog?: () => void;
  onOpenWindow?: () => void;
  trafficLightInset?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-11 shrink-0 flex-row items-center gap-2 border-b border-border/70 px-3",
        trafficLightInset && "[-webkit-app-region:drag] pl-[88px]",
      )}
    >
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
      {onOpenDialog ? (
        <Button
          aria-label="Open in dialog"
          className="[-webkit-app-region:no-drag]"
          onClick={onOpenDialog}
          size="icon-xs"
          title="Open in dialog"
          type="button"
          variant="ghost"
        >
          <ExternalLink />
        </Button>
      ) : null}
      {onOpenWindow ? (
        <Button
          aria-label="Open in window"
          className="[-webkit-app-region:no-drag]"
          onClick={onOpenWindow}
          size="icon-xs"
          title="Open in window"
          type="button"
          variant="ghost"
        >
          <WindowIcon />
        </Button>
      ) : null}
      {onClose ? (
        <Button
          aria-label="Close"
          className="[-webkit-app-region:no-drag]"
          onClick={onClose}
          size="icon-xs"
          title="Close"
          type="button"
          variant="ghost"
        >
          <Close />
        </Button>
      ) : null}
    </div>
  );
}

function WorkspaceToolContent({
  active,
  api,
  instance,
}: {
  active: boolean;
  api: ApiClient;
  instance: WorkspaceToolInstance;
}) {
  switch (instance.kind) {
    case "browser":
      return (
        <WorkspaceBrowserToolView
          active={active}
          browserViewId={instance.browserViewId}
          initialUrl={instance.url}
        />
      );
    case "file-preview":
      return <WorkspaceFilePreview api={api} instance={instance} />;
    case "git-diff":
      return <WorkspaceGitDiffTool api={api} instance={instance} />;
    case "terminal":
      return (
        <div className="h-full min-h-0 overflow-hidden bg-background p-2">
          <WorkspaceTerminalView
            autoFocus={active}
            root={instance.root}
            sessionId={instance.sessionId}
          />
        </div>
      );
  }
}

function workspaceToolDisplayTitle(instance: WorkspaceToolInstance) {
  const root = instance.kind === "browser" ? undefined : instance.root;
  const rootName = root ? workspaceToolRootName(root) : undefined;

  return rootName ? `${instance.title} · ${rootName}` : instance.title;
}

function workspaceToolIcon(instance: WorkspaceToolInstance) {
  switch (instance.kind) {
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

function workspaceToolRootName(root: string) {
  const parts = root.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

function WorkspaceFilePreview({
  api,
  instance,
}: {
  api: ApiClient;
  instance: Extract<WorkspaceToolInstance, { kind: "file-preview" }>;
}) {
  const fileQuery = useQuery({
    queryFn: () =>
      api.workspaceTools.readFile({
        path: instance.path,
        root: instance.root,
      }),
    queryKey: queryKeys.workspaceTools.readFile(instance.root, instance.path),
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

function WorkspaceGitDiffTool({
  api,
  instance,
}: {
  api: ApiClient;
  instance: Extract<WorkspaceToolInstance, { kind: "git-diff" }>;
}) {
  const gitQuery = useQuery({
    queryFn: () => api.workspaceTools.gitDiff({ root: instance.root }),
    queryKey: queryKeys.workspaceTools.gitDiff(instance.root),
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
    <WorkspaceGitDiffResultView
      data={gitQuery.data}
      pathFilter={instance.path}
    />
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

function WorkspaceToolPatchFileItem({
  file,
}: {
  file: WorkspaceToolPatchFile;
}) {
  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineCount = getWorkspaceToolPatchFileLineCount(file);

  return (
    <Collapsible
      className="overflow-hidden rounded-md border border-border/70 bg-background"
      defaultOpen={lineCount <= largeWorkspaceDiffLineThreshold}
    >
      <CollapsibleTrigger
        className={cn(
          "group flex min-h-9 w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/50",
        )}
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
    errors: [staged.error, unstaged.error].filter((error): error is string =>
      Boolean(error),
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

function formatUnsupportedFileReason(
  result: Extract<WorkspaceFileReadResult, { type: "unsupported" }>,
) {
  const size =
    typeof result.size === "number" ? `, ${formatBytes(result.size)}` : "";

  switch (result.reason) {
    case "binary":
      return `Binary file${size}`;
    case "not-file":
      return `Not a regular file${size}`;
    case "too-large":
      return `File is too large${size}`;
  }
}

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
