import type {
  WorkspaceGitBranchStatus,
  WorkspaceGitLogCommit,
} from "@angel-engine/daemon-api/workspace-tools";
import type { FormEvent } from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import type { WorkspaceToolPanelLayout } from "@/app/workspace/workspace-files-panels";
import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";

import {
  ArrowDown,
  ArrowUp,
  CaretDown,
  Check,
  GitBranch,
  GitCommit,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceDiffCommentPanel } from "@/app/workspace/workspace-diff-comment-panel";
import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  useWorkspaceGitPanelState,
  WorkspaceGitCommitComposer,
} from "@/app/workspace/workspace-git-commit";
import { WorkspaceGitStatusBar } from "@/app/workspace/workspace-git-status-bar";
import {
  formatWorkspaceGitCommitTime,
  workspaceGitRemoteFromUpstream,
  type WorkspaceGitPanelView,
} from "@/app/workspace/workspace-git-window-model";
import {
  WorkspaceToolPatchFileDiffContent,
  WorkspaceToolPatchFileLineStats,
} from "@/app/workspace/workspace-tool-diff";
import {
  initialWorkspaceToolGitListWidth,
  WorkspaceToolBanner,
  WorkspaceToolEmpty,
  workspaceToolGitListWidthMax,
  workspaceToolGitListWidthMin,
  workspaceToolGitListWidthStorageKey,
  WorkspaceToolPanelSplitter,
} from "@/app/workspace/workspace-tool-layout";
import {
  WorkspaceToolPatchFileList,
  WorkspaceToolPatchFileName,
} from "@/app/workspace/workspace-tool-patch-list";
import {
  buildWorkspaceToolPatchList,
  formatWorkspaceToolPatchFileName,
  getWorkspaceToolPatchFileLineChanges,
} from "@/app/workspace/workspace-tool-patch-model";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

export function WorkspaceGitPanel({
  layout,
  root,
}: {
  layout: WorkspaceToolPanelLayout;
  root: string;
}) {
  const { api } = useWorkspaceToolSurface();
  const { t } = useTranslation();
  const {
    checkoutMutation,
    commitDescription,
    commitMutation,
    commitSelectedPaths,
    commitSummary,
    gitQuery,
    handleFileSelectedChange,
    pullMutation,
    pushMutation,
    selectedFileKeys,
    setCommitDescription,
    setCommitSummary,
  } = useWorkspaceGitPanelState(api, root);
  const [activeFileKey, setActiveFileKey] = useState<string | null>(null);
  const [gitListWidth, setGitListWidth] = useState(
    initialWorkspaceToolGitListWidth,
  );
  const [panelView, setPanelView] = useState<WorkspaceGitPanelView>("changes");
  const [activeCommitHash, setActiveCommitHash] = useState<string | null>(null);
  const updateGitListWidth = useCallback((width: number) => {
    setGitListWidth(width);
    window.localStorage.setItem(
      workspaceToolGitListWidthStorageKey,
      String(width),
    );
  }, []);

  if (gitQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(gitQuery.error)}
        icon={GitBranch}
        title={t("workspace.tools.empty.gitUnavailable")}
      />
    );
  }

  if (gitQuery.isLoading) {
    return null;
  }

  const data = gitQuery.data;
  if (!data?.isGitRepository) {
    return (
      <WorkspaceToolEmpty
        detail={root}
        icon={GitBranch}
        title={t("workspace.tools.empty.notGitRepository")}
      />
    );
  }

  const patchList = buildWorkspaceToolPatchList(
    data.stagedPatch,
    data.unstagedPatch,
    data.skippedFiles,
  );
  const selectedFiles = patchList.files.filter(
    (file) => selectedFileKeys[file.key] ?? true,
  );
  const selectedPaths = selectedFiles.map((file) => file.name);
  const handleCommitSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitSelectedPaths(selectedPaths);
  };
  const split = layout === "split";
  const activeFile = split
    ? (patchList.files.find((file) => file.key === activeFileKey) ??
      patchList.files[0])
    : undefined;
  const statusBar = (
    <WorkspaceGitStatusBar
      branchStatus={data.branchStatus}
      conflictedPaths={data.conflictedPaths}
      dirtyCount={
        data.status.filter((entry) => entry.status !== "ignored").length
      }
      pushError={pushMutation.isError ? pushMutation.error : undefined}
      pushPending={pushMutation.isPending}
      onPush={() => pushMutation.mutate()}
    />
  );
  const changeColumn = (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {data.warnings.length > 0 ? (
          <WorkspaceToolBanner className="m-3 shrink-0" tone="attention">
            {data.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </WorkspaceToolBanner>
        ) : null}
        <WorkspaceToolPatchFileList
          flush
          activeFileKey={activeFile?.key}
          patchList={patchList}
          rowMode={split ? "select" : "expand"}
          selectedFileKeys={selectedFileKeys}
          onFileActivate={
            split ? (file) => setActiveFileKey(file.key) : undefined
          }
          onFileSelectedChange={handleFileSelectedChange}
        />
      </div>
      {patchList.files.length === 0 ? null : (
        <WorkspaceGitCommitComposer
          branch={data.branchStatus.branch}
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
      )}
    </>
  );

  if (!split) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {statusBar}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {changeColumn}
        </div>
        <WorkspaceDiffCommentPanel root={root} />
      </div>
    );
  }

  // Window mode: GitHub Desktop-like toolbar + Changes/History.
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <WorkspaceGitWindowToolbar
        branchStatus={data.branchStatus}
        checkoutMutation={checkoutMutation}
        pullMutation={pullMutation}
        pushMutation={pushMutation}
        root={root}
      />
      <div className="flex min-h-0 flex-1">
        <div
          className="flex min-h-0 shrink-0 flex-col"
          style={{ width: gitListWidth }}
        >
          <WorkspaceGitViewTabs
            value={panelView}
            onChange={(view) => {
              setPanelView(view);
              if (view === "history") setActiveCommitHash(null);
            }}
          />
          {panelView === "changes" ? (
            changeColumn
          ) : (
            <WorkspaceGitHistoryList
              activeHash={activeCommitHash}
              root={root}
              onSelect={setActiveCommitHash}
            />
          )}
        </div>
        <WorkspaceToolPanelSplitter
          ariaLabel={t("workspace.tools.resizeGitList")}
          max={workspaceToolGitListWidthMax}
          min={workspaceToolGitListWidthMin}
          value={gitListWidth}
          onChange={updateGitListWidth}
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          {panelView === "changes" ? (
            <div className="flex h-full min-h-0 flex-col">
              <WorkspaceGitDiffViewer file={activeFile} />
              <WorkspaceDiffCommentPanel root={root} />
            </div>
          ) : (
            <WorkspaceGitHistoryDiff hash={activeCommitHash} root={root} />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkspaceGitViewTabs({
  value,
  onChange,
}: {
  value: WorkspaceGitPanelView;
  onChange: (view: WorkspaceGitPanelView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      aria-label={t("workspace.tools.git.viewTabs")}
      className="
        flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle px-2
      "
      role="tablist"
    >
      <WorkspaceGitViewTab
        active={value === "changes"}
        label={t("workspace.tools.git.changes")}
        onClick={() => onChange("changes")}
      />
      <WorkspaceGitViewTab
        active={value === "history"}
        label={t("workspace.tools.git.history")}
        onClick={() => onChange("history")}
      />
    </div>
  );
}

function WorkspaceGitViewTab({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        `
          relative h-7 rounded-md px-2.5 text-xs font-medium transition-colors
          outline-none
          focus-visible:ring-2 focus-visible:ring-ring
        `,
        active
          ? "bg-surface-2 text-foreground"
          : "text-muted-foreground hover:bg-overlay-hover hover:text-foreground",
      )}
      role="tab"
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function WorkspaceGitWindowToolbar({
  branchStatus,
  checkoutMutation,
  pullMutation,
  pushMutation,
  root,
}: {
  branchStatus: WorkspaceGitBranchStatus;
  checkoutMutation: UseMutationResult<unknown, Error, string, unknown>;
  pullMutation: UseMutationResult<unknown, Error, void, unknown>;
  pushMutation: UseMutationResult<unknown, Error, void, unknown>;
  root: string;
}) {
  const { api } = useWorkspaceToolSurface();
  const { t } = useTranslation();
  const branchesQuery = useQuery({
    queryFn: async () => api.workspaceTools.gitBranches({ root }),
    queryKey: queryKeys.workspaceTools.gitBranches(root),
    staleTime: 5_000,
  });

  const { ahead, behind, branch, detached, unborn, upstream } = branchStatus;
  const hasBranch = is.nonEmptyString(branch);
  const hasUpstream = is.nonEmptyString(upstream);
  const remote = workspaceGitRemoteFromUpstream(upstream);
  const canPush =
    hasBranch && !detached && !unborn && (!hasUpstream || ahead > 0);
  const canPull = hasUpstream && behind > 0 && !detached && !unborn;
  const busy =
    checkoutMutation.isPending ||
    pullMutation.isPending ||
    pushMutation.isPending;
  const branchLabel = unborn
    ? t("workspace.tools.git.noCommits")
    : detached
      ? t("workspace.tools.git.detached")
      : hasBranch
        ? branch
        : t("workspace.tools.git.noCommits");
  const localBranches = useMemo(
    () => (branchesQuery.data?.branches ?? []).filter((item) => !item.isRemote),
    [branchesQuery.data?.branches],
  );
  const actionError =
    checkoutMutation.error ?? pullMutation.error ?? pushMutation.error;

  return (
    <div className="shrink-0 border-b border-border-subtle">
      <div className="flex h-10 items-center gap-2 px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="min-w-0 max-w-[min(280px,40%)] justify-start gap-1.5"
              disabled={busy || branchesQuery.isLoading}
              size="xs"
              type="button"
              variant="outline"
            >
              <GitBranch className="size-3.5 shrink-0" weight="duotone" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {branchLabel}
              </span>
              <CaretDown className="size-3 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-64">
            <DropdownMenuLabel>
              {t("workspace.tools.git.currentBranch")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {localBranches.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                {t("workspace.tools.git.noBranches")}
              </div>
            ) : (
              localBranches.map((item) => (
                <DropdownMenuItem
                  key={item.name}
                  className="gap-2 font-mono text-xs"
                  disabled={item.current || checkoutMutation.isPending}
                  onSelect={() => {
                    checkoutMutation.mutate(item.name);
                  }}
                >
                  <span className="flex size-3.5 shrink-0 items-center justify-center">
                    {item.current ? (
                      <Check className="size-3" weight="bold" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            disabled={busy || !canPull}
            size="xs"
            type="button"
            variant="outline"
            onClick={() => pullMutation.mutate()}
          >
            <ArrowDown className="size-3.5" />
            {pullMutation.isPending
              ? t("workspace.tools.git.pulling")
              : behind > 0
                ? t("workspace.tools.git.pullCount", {
                    count: behind,
                    remote,
                  })
                : t("workspace.tools.git.pull", { remote })}
          </Button>
          <Button
            disabled={busy || !canPush}
            size="xs"
            type="button"
            variant="outline"
            onClick={() => pushMutation.mutate()}
          >
            <ArrowUp className="size-3.5" />
            {pushMutation.isPending
              ? t("workspace.tools.git.pushing")
              : hasUpstream
                ? ahead > 0
                  ? t("workspace.tools.git.pushCount", {
                      count: ahead,
                      remote,
                    })
                  : t("workspace.tools.git.push")
                : t("workspace.tools.git.publish")}
          </Button>
        </div>
      </div>
      {actionError ? (
        <WorkspaceToolBanner className="mx-3 mb-2" tone="danger">
          {getErrorMessage(actionError)}
        </WorkspaceToolBanner>
      ) : null}
    </div>
  );
}

function WorkspaceGitHistoryList({
  activeHash,
  root,
  onSelect,
}: {
  activeHash: string | null;
  root: string;
  onSelect: (hash: string) => void;
}) {
  const { api } = useWorkspaceToolSurface();
  const { t, i18n } = useTranslation();
  const logQuery = useQuery({
    queryFn: async () => api.workspaceTools.gitLog({ limit: 100, root }),
    queryKey: queryKeys.workspaceTools.gitLog(root),
    staleTime: 5_000,
  });

  if (logQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(logQuery.error)}
        icon={GitCommit}
        title={t("workspace.tools.empty.gitUnavailable")}
      />
    );
  }

  if (logQuery.isLoading) {
    return null;
  }

  const commits = logQuery.data?.commits ?? [];
  if (commits.length === 0) {
    return (
      <WorkspaceToolEmpty
        icon={GitCommit}
        title={t("workspace.tools.git.noHistory")}
      />
    );
  }

  const selectedHash = activeHash ?? commits[0]?.hash;

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <ul className="divide-y divide-border-subtle">
        {commits.map((commit) => (
          <WorkspaceGitHistoryRow
            key={commit.hash}
            active={commit.hash === selectedHash}
            commit={commit}
            locale={i18n.language}
            onSelect={() => onSelect(commit.hash)}
          />
        ))}
      </ul>
    </div>
  );
}

function WorkspaceGitHistoryRow({
  active,
  commit,
  locale,
  onSelect,
}: {
  active: boolean;
  commit: WorkspaceGitLogCommit;
  locale?: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        className={cn(
          `
            flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors
            outline-none
            focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring
          `,
          active ? "bg-surface-2" : "hover:bg-overlay-hover",
        )}
        type="button"
        onClick={onSelect}
      >
        <span className="line-clamp-2 text-xs font-medium text-foreground">
          {commit.subject}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="truncate font-mono">{commit.shortHash}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{commit.authorName}</span>
          {is.nonEmptyString(commit.committedAt) ? (
            <>
              <span aria-hidden="true">·</span>
              <span className="shrink-0">
                {formatWorkspaceGitCommitTime(commit.committedAt, locale)}
              </span>
            </>
          ) : null}
        </span>
      </button>
    </li>
  );
}

function WorkspaceGitHistoryDiff({
  hash,
  root,
}: {
  hash: string | null;
  root: string;
}) {
  const { api } = useWorkspaceToolSurface();
  const { t } = useTranslation();
  const [activeFileKey, setActiveFileKey] = useState<string | null>(null);
  const logQuery = useQuery({
    queryFn: async () => api.workspaceTools.gitLog({ limit: 100, root }),
    queryKey: queryKeys.workspaceTools.gitLog(root),
    staleTime: 5_000,
  });
  const resolvedHash = hash ?? logQuery.data?.commits[0]?.hash ?? null;
  useEffect(() => {
    setActiveFileKey(null);
  }, [resolvedHash]);
  const showQuery = useQuery({
    enabled: is.nonEmptyString(resolvedHash),
    queryFn: async () => {
      if (!is.nonEmptyString(resolvedHash)) {
        throw new Error("Commit hash is required.");
      }
      return api.workspaceTools.gitCommitShow({
        hash: resolvedHash,
        root,
      });
    },
    queryKey: queryKeys.workspaceTools.gitCommitShow(root, resolvedHash),
    staleTime: 30_000,
  });

  const patchList = useMemo(
    () =>
      showQuery.data
        ? buildWorkspaceToolPatchList(showQuery.data.patch, "", [])
        : { errors: [] as string[], files: [] as WorkspaceToolPatchFile[] },
    [showQuery.data],
  );
  const activeFile =
    patchList.files.find((file) => file.key === activeFileKey) ??
    patchList.files[0];

  if (!is.nonEmptyString(resolvedHash)) {
    return (
      <WorkspaceToolEmpty
        icon={GitCommit}
        title={t("workspace.tools.git.noHistory")}
      />
    );
  }

  if (showQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(showQuery.error)}
        icon={GitCommit}
        title={t("workspace.tools.empty.gitUnavailable")}
      />
    );
  }

  if (showQuery.isLoading || !showQuery.data) {
    return null;
  }

  if (patchList.files.length === 0) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div
          className="
            flex h-8 shrink-0 items-center border-b border-border-subtle px-3
            text-xs text-muted-foreground
          "
        >
          {showQuery.data.subject ?? resolvedHash}
        </div>
        <WorkspaceToolEmpty
          icon={GitCommit}
          title={t("workspace.tools.empty.noChanges")}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-48 shrink-0 flex-col border-r border-border-subtle">
        <div
          className="
            flex h-8 shrink-0 items-center border-b border-border-subtle px-3
            text-xs text-muted-foreground
          "
          title={showQuery.data.subject}
        >
          <span className="truncate">
            {showQuery.data.subject ?? resolvedHash.slice(0, 7)}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <WorkspaceToolPatchFileList
            flush
            activeFileKey={activeFile?.key}
            patchList={patchList}
            rowMode="select"
            onFileActivate={(file) => setActiveFileKey(file.key)}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <WorkspaceGitDiffViewer file={activeFile} />
      </div>
    </div>
  );
}

function WorkspaceGitDiffViewer({ file }: { file?: WorkspaceToolPatchFile }) {
  const { t } = useTranslation();
  if (!file) {
    return (
      <WorkspaceToolEmpty
        icon={GitBranch}
        title={t("workspace.tools.empty.noChanges")}
      />
    );
  }

  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineChanges = getWorkspaceToolPatchFileLineChanges(file);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className="
          flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle
          px-3 text-xs
        "
      >
        <WorkspaceToolPatchFileName name={fileName} />
        <WorkspaceToolPatchFileLineStats lineChanges={lineChanges} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <WorkspaceToolPatchFileDiffContent file={file} />
      </div>
    </div>
  );
}
