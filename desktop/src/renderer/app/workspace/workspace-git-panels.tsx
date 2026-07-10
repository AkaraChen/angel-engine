import type { FormEvent } from "react";
import type { ApiClient } from "@/platform/api-client";

import { useCallback, useState } from "react";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  WorkspaceGitCommitComposer,
  useWorkspaceGitPanelState,
} from "@/app/workspace/workspace-git-commit";
import {
  initialWorkspaceToolGitListWidth,
  WorkspaceToolEmpty,
  WorkspaceToolPanelSplitter,
  workspaceToolGitListWidthMax,
  workspaceToolGitListWidthMin,
  workspaceToolGitListWidthStorageKey,
} from "@/app/workspace/workspace-tool-layout";
import {
  buildWorkspaceToolPatchList,
  formatWorkspaceToolPatchFileName,
  getWorkspaceToolPatchFileLineChanges,
} from "@/app/workspace/workspace-tool-patch-model";
import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";
import {
  WorkspaceToolPatchFileDiffContent,
  WorkspaceToolPatchFileLineStats,
} from "@/app/workspace/workspace-tool-diff";
import { WorkspaceToolPatchFileList } from "@/app/workspace/workspace-tool-patch-list";

export function WorkspaceGitPanel({
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

  if (gitQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(gitQuery.error)}
        title="Git unavailable"
      />
    );
  }

  if (gitQuery.isLoading) {
    return null;
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
              m-3 space-y-1 rounded-md border border-status-attention-border
              bg-status-attention-soft p-2 text-xs text-muted-foreground
              select-text
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

export function WorkspaceWindowGitPanel({
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
        title="Git unavailable"
      />
    );
  }

  if (gitQuery.isLoading) {
    return null;
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
      <div className="flex shrink-0 flex-col" style={{ width: gitListWidth }}>
        <div className="min-h-0 flex-1 overflow-auto">
          {data.warnings.length > 0 ? (
            <div
              className="
                m-3 space-y-1 rounded-md border border-status-attention-border
                bg-status-attention-soft p-2 text-xs text-muted-foreground
                select-text
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
      <WorkspaceToolPanelSplitter
        ariaLabel="Resize Git change list"
        max={workspaceToolGitListWidthMax}
        min={workspaceToolGitListWidthMin}
        value={gitListWidth}
        onChange={updateGitListWidth}
      />
      <div className="min-w-0 flex-1 overflow-hidden">
        <WorkspaceWindowGitDiffViewer file={activeFile} />
      </div>
    </div>
  );
}

function WorkspaceWindowGitDiffViewer({
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
