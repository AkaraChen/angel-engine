import type { FormEvent } from "react";
import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";
import type { WorkspaceGitDiffBaseKind } from "@angel-engine/daemon-api/workspace-tools";

import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSourceControlActivation } from "@/features/source-control/api/use-activation";
import { capabilityState } from "@/features/source-control/model";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

const commitSummaryLimit = 50;

export function useWorkspaceGitPanelState(
  api: ApiClient,
  root: string,
  chatId: string | null,
  baseKind: WorkspaceGitDiffBaseKind,
  projectId: string | null,
) {
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
        queryKey: queryKeys.workspaceTools.gitDiffRoot(root),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.workspaceTools.fileTree(root),
      });
    },
  });
  const gitQuery = useQuery({
    queryFn: async () =>
      api.workspaceTools.gitDiff({
        baseKind,
        chatId: chatId ?? undefined,
        root,
      }),
    queryKey: queryKeys.workspaceTools.gitDiff(root, baseKind, null, chatId),
    retry: false,
    staleTime: 5_000,
  });
  const invalidateGit = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.gitDiff(root),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.gitBranches(root),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.gitLog(root),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.fileTree(root),
    });
  }, [queryClient, root]);
  const activation = useSourceControlActivation(projectId);
  const publishCapability = capabilityState(
    activation.capabilities,
    "branches.publish",
  );
  const pushMutation = useMutation({
    mutationFn: async (localBranch: string) => {
      if (
        activation.status !== "active" ||
        !is.nonEmptyString(activation.projectPath) ||
        !publishCapability.supported
      ) {
        throw new Error("Branch publishing requires an active provider.");
      }
      return api.sourceControl.publishBranch({
        localBranch,
        projectPath: activation.projectPath,
      });
    },
    onSuccess: invalidateGit,
  });
  const pullMutation = useMutation({
    mutationFn: async () => api.workspaceTools.gitPull({ root }),
    onSuccess: invalidateGit,
  });
  const checkoutMutation = useMutation({
    mutationFn: async (branch: string) =>
      api.workspaceTools.gitCheckout({ branch, root }),
    onSuccess: invalidateGit,
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
    checkoutMutation,
    commitDescription,
    commitMutation,
    commitSelectedPaths,
    commitSummary,
    gitQuery,
    handleFileSelectedChange,
    pullMutation,
    publishCapabilities: activation.capabilities,
    publishProviderActive: activation.status === "active",
    refetchActivation: activation.refetch,
    pushMutation,
    selectedFileKeys,
    setCommitDescription,
    setCommitSummary,
  };
}

export function WorkspaceGitCommitComposer({
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
  const { t } = useTranslation();
  const disabled =
    pending || selectedCount === 0 || summary.trim().length === 0;
  const target = is.nonEmptyString(branch) ? branch : "HEAD";
  const summaryLength = summary.trim().length;
  const summaryOverLimit = summaryLength > commitSummaryLimit;

  return (
    <form
      className="shrink-0 border-t border-border-subtle p-2"
      onSubmit={onSubmit}
    >
      <div className="space-y-1.5">
        <div className="relative">
          <Input
            className="
              h-6 rounded-md bg-surface-1 py-0.5 pr-9 pl-2 font-mono text-xs
              select-text
            "
            placeholder={t("workspace.tools.commit.summaryPlaceholder")}
            value={summary}
            onChange={(event) => onSummaryChange(event.currentTarget.value)}
          />
          {summaryLength === 0 ? null : (
            <span
              aria-hidden="true"
              className={cn(
                `
                  pointer-events-none absolute inset-y-0 right-2 flex
                  items-center font-mono text-[10px] tabular-nums
                `,
                summaryOverLimit
                  ? "text-status-attention"
                  : "text-muted-foreground",
              )}
              // The 50-character first line is a git convention, not a limit:
              // the counter nudges, it never blocks the commit.
            >
              {summaryLength}/{commitSummaryLimit}
            </span>
          )}
        </div>
        <Textarea
          className="
            min-h-12 rounded-md bg-surface-1 p-1.5 font-mono text-xs select-text
          "
          placeholder={t("workspace.tools.commit.descriptionPlaceholder")}
          value={description}
          onChange={(event) => onDescriptionChange(event.currentTarget.value)}
        />
        {is.nonEmptyString(errorMessage) ? (
          <WorkspaceToolBanner tone="danger">
            {errorMessage}
          </WorkspaceToolBanner>
        ) : null}
        <div className="flex items-center gap-1.5">
          <div
            className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
            title={t("workspace.tools.commit.filesSelected", {
              selected: selectedCount,
              total: totalCount,
            })}
          >
            {t("workspace.tools.commit.filesSelected", {
              selected: selectedCount,
              total: totalCount,
            })}
          </div>
          {/* The only primary CTA in the whole tool-panel surface. */}
          <Button disabled={disabled} size="xs" type="submit">
            {pending
              ? t("workspace.tools.commit.committing")
              : t("workspace.tools.commit.commitTo", { target })}
          </Button>
        </div>
      </div>
    </form>
  );
}
