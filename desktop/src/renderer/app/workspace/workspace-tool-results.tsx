import type {
  WorkspaceFileReadResult,
  WorkspaceGitDiffResult,
} from "@angel-engine/daemon-api/workspace-tools";
import type { WorkspaceToolSurfaceDynamicTab } from "@shared/workspace-tool-surface";

import { FileText, GitBranch } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  formatBytes,
  formatUnsupportedFileReason,
  getErrorMessage,
} from "@/app/workspace/workspace-file-display";
import {
  WorkspaceToolBanner,
  WorkspaceToolEmpty,
} from "@/app/workspace/workspace-tool-layout";
import { WorkspaceToolPatchFileRows } from "@/app/workspace/workspace-tool-patch-list";
import { buildWorkspaceToolPatchList } from "@/app/workspace/workspace-tool-patch-model";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { queryKeys } from "@/platform/query-keys";

export function WorkspaceFilePreview({
  tab,
}: {
  tab: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "file-preview" }>;
}) {
  const { api } = useWorkspaceToolSurface();
  const { t } = useTranslation();
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
        icon={FileText}
        title={t("workspace.tools.empty.fileUnavailable")}
      />
    );
  }

  return <WorkspaceFileReadResultView result={fileQuery.data} />;
}

export function WorkspaceGitDiffTool({
  tab,
}: {
  tab: Extract<WorkspaceToolSurfaceDynamicTab, { kind: "git-diff" }>;
}) {
  const { api } = useWorkspaceToolSurface();
  const { t } = useTranslation();
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
        icon={GitBranch}
        title={t("workspace.tools.empty.gitUnavailable")}
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
    return <WorkspaceToolEmpty icon={FileText} title="File unavailable" />;
  }

  if (result.type === "unsupported") {
    return (
      <WorkspaceToolEmpty
        detail={formatUnsupportedFileReason(result)}
        icon={FileText}
        title={result.path}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="
          flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle
          px-3 font-mono text-xs text-muted-foreground
        "
      >
        <span className="min-w-0 flex-1 truncate" title={result.path}>
          {result.path}
        </span>
        <span className="shrink-0 tabular-nums">
          {formatBytes(result.size)}
        </span>
      </div>
      <pre
        className="
          min-h-0 flex-1 overflow-auto bg-card p-4 font-mono text-xs/5
          whitespace-pre text-foreground select-text
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
  const { t } = useTranslation();
  if (!data?.isGitRepository) {
    return (
      <WorkspaceToolEmpty
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
  const files = is.nonEmptyString(pathFilter)
    ? patchList.files.filter((file) => file.name === pathFilter)
    : patchList.files;

  return (
    <div className="h-full min-h-0 overflow-auto p-3">
      {data.warnings.length > 0 ? (
        <WorkspaceToolBanner className="mb-3" tone="attention">
          {data.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </WorkspaceToolBanner>
      ) : null}
      {patchList.errors.map((error) => (
        <WorkspaceToolBanner className="mb-2" key={error} tone="danger">
          {error}
        </WorkspaceToolBanner>
      ))}
      {files.length > 0 ? (
        <WorkspaceToolPatchFileRows files={files} />
      ) : (
        <WorkspaceToolEmpty
          detail={pathFilter}
          icon={GitBranch}
          title={
            is.nonEmptyString(pathFilter)
              ? t("workspace.tools.empty.noDiffForFile")
              : t("workspace.tools.empty.noChanges")
          }
        />
      )}
    </div>
  );
}
