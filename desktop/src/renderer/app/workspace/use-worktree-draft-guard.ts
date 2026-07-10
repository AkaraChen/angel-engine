import type { ChatCreationLocation } from "@shared/chat";
import type { ProjectGitStatusResult } from "@shared/projects";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";

import is from "@sindresorhus/is";
import { useCallback, useState } from "react";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import { queryKeys } from "@/platform/query-keys";

export interface WorktreeDirtyPromptState {
  resolve: (confirmed: boolean) => void;
  status: ProjectGitStatusResult;
}

export function useWorktreeDraftGuard(model: WorkspacePageModel) {
  const {
    api,
    draftCreationLocation,
    draftCreationLocationKey,
    draftProject,
    queryClient,
    setDraftCreationLocations,
    setWorktreeDirtyPromptEnabled,
    t,
    toast,
    worktreeDirtyPromptEnabled,
  } = model;
  const [worktreeDirtyPrompt, setWorktreeDirtyPrompt] =
    useState<WorktreeDirtyPromptState | null>(null);
  const [rememberWorktreeDirtyChoice, setRememberWorktreeDirtyChoice] =
    useState(false);

  const setDraftCreationLocation = useCallback(
    (creationLocation: ChatCreationLocation) => {
      setDraftCreationLocations((current) =>
        current[draftCreationLocationKey] === creationLocation
          ? current
          : {
              ...current,
              [draftCreationLocationKey]: creationLocation,
            },
      );
    },
    [draftCreationLocationKey, setDraftCreationLocations],
  );
  const confirmDirtyWorktree = useCallback(
    async (status: ProjectGitStatusResult) =>
      new Promise<boolean>((resolve) => {
        setRememberWorktreeDirtyChoice(false);
        setWorktreeDirtyPrompt({ resolve, status });
      }),
    [],
  );
  const closeWorktreeDirtyPrompt = useCallback(
    (confirmed: boolean) => {
      if (!worktreeDirtyPrompt) return;

      if (confirmed && rememberWorktreeDirtyChoice) {
        setWorktreeDirtyPromptEnabled(false);
      }
      const { resolve } = worktreeDirtyPrompt;
      setWorktreeDirtyPrompt(null);
      setRememberWorktreeDirtyChoice(false);
      resolve(confirmed);
    },
    [
      rememberWorktreeDirtyChoice,
      setWorktreeDirtyPromptEnabled,
      worktreeDirtyPrompt,
    ],
  );
  const ensureDraftChatCanSubmit = useCallback(async () => {
    if (draftCreationLocation !== "worktree") return true;
    if (!is.nonEmptyString(draftProject.id)) return false;

    try {
      const status = await api.projects.gitStatus({
        projectId: draftProject.id,
      });
      queryClient.setQueryData(
        queryKeys.projects.gitStatus(draftProject.id),
        status,
      );

      if (!status.isGitRepository) {
        toast({
          description: t("workspace.worktreeNotGitRepository"),
          title: t("notifications.projectActionFailed"),
          variant: "destructive",
        });
        return false;
      }
      if (!status.isDirty || !worktreeDirtyPromptEnabled) return true;
      return await confirmDirtyWorktree(status);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("notifications.projectActionFailed"),
        variant: "destructive",
      });
      return false;
    }
  }, [
    api,
    confirmDirtyWorktree,
    draftCreationLocation,
    draftProject.id,
    queryClient,
    t,
    toast,
    worktreeDirtyPromptEnabled,
  ]);

  return {
    closeWorktreeDirtyPrompt,
    ensureDraftChatCanSubmit,
    rememberWorktreeDirtyChoice,
    setDraftCreationLocation,
    setRememberWorktreeDirtyChoice,
    worktreeDirtyPrompt,
  };
}

export type WorktreeDraftGuard = ReturnType<typeof useWorktreeDraftGuard>;
