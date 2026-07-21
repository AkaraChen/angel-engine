import type { FormEvent } from "react";
import type { WorkspaceToolPanelLayout } from "@/app/workspace/workspace-files-panels";
import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";

import { GitBranch } from "@phosphor-icons/react";
import { useCallback, useState } from "react";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  useWorkspaceGitPanelState,
  WorkspaceGitCommitComposer,
} from "@/app/workspace/workspace-git-commit";
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
import { WorkspaceToolPatchFileList } from "@/app/workspace/workspace-tool-patch-list";
import {
  buildWorkspaceToolPatchList,
  formatWorkspaceToolPatchFileName,
  getWorkspaceToolPatchFileLineChanges,
} from "@/app/workspace/workspace-tool-patch-model";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";

export function WorkspaceGitPanel({
  layout,
  root,
}: {
  layout: WorkspaceToolPanelLayout;
  root: string;
}) {
  const { api } = useWorkspaceToolSurface();
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
        title="Git unavailable"
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
        title="Not a Git repository"
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
  const changeColumn = (
    <>
      <div className="min-h-0 flex-1 overflow-auto">
        {data.warnings.length > 0 ? (
          <WorkspaceToolBanner className="m-3" tone="attention">
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
    </>
  );

  if (!split) {
    return <div className="flex h-full min-h-0 flex-col">{changeColumn}</div>;
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex shrink-0 flex-col" style={{ width: gitListWidth }}>
        {changeColumn}
      </div>
      <WorkspaceToolPanelSplitter
        ariaLabel="Resize Git change list"
        max={workspaceToolGitListWidthMax}
        min={workspaceToolGitListWidthMin}
        value={gitListWidth}
        onChange={updateGitListWidth}
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <WorkspaceGitDiffViewer file={activeFile} />
      </div>
    </div>
  );
}

function WorkspaceGitDiffViewer({ file }: { file?: WorkspaceToolPatchFile }) {
  if (!file) {
    return <WorkspaceToolEmpty icon={GitBranch} title="No changes" />;
  }

  const fileName = formatWorkspaceToolPatchFileName(file);
  const lineChanges = getWorkspaceToolPatchFileLineChanges(file);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        className="
          flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle
          px-3 text-xs
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
