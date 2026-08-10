import type { FormEvent } from "react";
import type { WorkspaceToolPanelLayout } from "@/app/workspace/workspace-files-panels";
import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";

import { GitBranch } from "@phosphor-icons/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceDiffCommentPanel } from "@/app/workspace/workspace-diff-comment-panel";
import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  formatWorkspaceGitDiffUnavailableReason,
  WorkspaceGitBaseSelect,
} from "@/app/workspace/workspace-git-base-select";
import {
  useWorkspaceGitPanelState,
  WorkspaceGitCommitComposer,
} from "@/app/workspace/workspace-git-commit";
import { WorkspaceGitStatusBar } from "@/app/workspace/workspace-git-status-bar";
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
import { useWorkspaceGitBasePreference } from "@/app/workspace/use-workspace-git-base-preference";

export function WorkspaceGitPanel({
  layout,
  root,
}: {
  layout: WorkspaceToolPanelLayout;
  root: string;
}) {
  const { api, chatId } = useWorkspaceToolSurface();
  const { t } = useTranslation();
  const { baseKind, setBaseKind } = useWorkspaceGitBasePreference(root);
  const {
    commitDescription,
    commitMutation,
    commitSelectedPaths,
    commitSummary,
    gitQuery,
    handleFileSelectedChange,
    pushMutation,
    selectedFileKeys,
    setCommitDescription,
    setCommitSummary,
  } = useWorkspaceGitPanelState(api, root, chatId, baseKind);
  const [activeFileKey, setActiveFileKey] = useState<string | null>(null);
  const [gitListWidth, setGitListWidth] = useState(
    initialWorkspaceToolGitListWidth,
  );
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
    "",
    data.patch,
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
        <div className="shrink-0 border-b border-border-subtle px-3 py-2">
          <WorkspaceGitBaseSelect
            bases={data.availableBases}
            resolvedBase={data.resolvedBase}
            value={baseKind}
            onChange={setBaseKind}
          />
        </div>
        {data.resolvedBase.unavailableReason ? (
          <WorkspaceToolBanner className="m-3 mb-0 shrink-0" tone="attention">
            {formatWorkspaceGitDiffUnavailableReason({
              fallbackKind: data.resolvedBase.kind,
              reason: data.resolvedBase.unavailableReason,
              requestedKind: data.requestedBaseKind,
              t,
            })}
          </WorkspaceToolBanner>
        ) : null}
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
      {patchList.files.length === 0 || baseKind !== "worktree" ? null : (
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

  // Split mode keeps the status line above both columns: branch position and
  // push are about the repository, not about the change list.
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {statusBar}
      <div className="flex min-h-0 flex-1">
        <div className="flex shrink-0 flex-col" style={{ width: gitListWidth }}>
          {changeColumn}
        </div>
        <WorkspaceToolPanelSplitter
          ariaLabel={t("workspace.tools.resizeGitList")}
          max={workspaceToolGitListWidthMax}
          min={workspaceToolGitListWidthMin}
          value={gitListWidth}
          onChange={updateGitListWidth}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <WorkspaceGitDiffViewer file={activeFile} />
          <WorkspaceDiffCommentPanel root={root} />
        </div>
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
