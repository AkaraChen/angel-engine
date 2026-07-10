import type { WorkspaceToolSurfaceDynamicTab } from "@shared/workspace-tool-surface";
import type {
  WorkspaceFileReadResult,
  WorkspaceGitDiffResult,
} from "@shared/workspace-tools";
import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";

import {
  formatBytes,
  formatUnsupportedFileReason,
  getErrorMessage,
} from "@/app/workspace/workspace-file-display";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { buildWorkspaceToolPatchList } from "@/app/workspace/workspace-tool-patch-model";
import { WorkspaceToolPatchFileRows } from "@/app/workspace/workspace-tool-patch-list";
import { queryKeys } from "@/platform/query-keys";

export function WorkspaceFilePreview({
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
    return null;
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

export function WorkspaceGitDiffTool({
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
    return null;
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
          flex h-9 shrink-0 items-center gap-2 border-b border-border-subtle
          px-3 text-xs text-muted-foreground
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
          text-foreground select-text
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
            mb-3 space-y-1 rounded-md border border-status-attention-border
            bg-status-attention-soft p-2 text-xs text-muted-foreground
            select-text
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
            mb-2 rounded-md border border-status-danger-border
            bg-status-danger-soft px-3 py-2 text-xs text-status-danger
            select-text
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
