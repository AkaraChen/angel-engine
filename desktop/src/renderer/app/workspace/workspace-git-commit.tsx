import type { FormEvent } from "react";
import type { WorkspaceToolPatchFile } from "@/app/workspace/workspace-tool-patch-model";

import type { ApiClient } from "@/platform/api-client";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { queryKeys } from "@/platform/query-keys";

export function useWorkspaceGitPanelState(api: ApiClient, root: string) {
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
  const disabled =
    pending || selectedCount === 0 || summary.trim().length === 0;
  const target = is.nonEmptyString(branch) ? branch : "HEAD";

  return (
    <form
      className="shrink-0 border-t border-border-subtle bg-background p-2"
      onSubmit={onSubmit}
    >
      <div className="space-y-1.5">
        <Input
          className="
            h-6 rounded-md bg-surface-1 px-2 py-0.5 text-xs select-text
          "
          placeholder="Summary"
          value={summary}
          onChange={(event) => onSummaryChange(event.currentTarget.value)}
        />
        <Textarea
          className="min-h-12 rounded-md bg-surface-1 p-1.5 text-xs select-text"
          placeholder="Description"
          value={description}
          onChange={(event) => onDescriptionChange(event.currentTarget.value)}
        />
        {is.nonEmptyString(errorMessage) ? (
          <div
            className="
              rounded-md border border-status-danger-border
              bg-status-danger-soft px-2 py-1.5 text-xs text-status-danger
              select-text
            "
          >
            {errorMessage}
          </div>
        ) : null}
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
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
