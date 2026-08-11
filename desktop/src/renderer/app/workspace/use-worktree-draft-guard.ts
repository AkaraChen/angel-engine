import type { ChatCreationLocation } from "@angel-engine/daemon-api/chat";
import type { ProjectGitStatusResult } from "@angel-engine/daemon-api/projects";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";
import type { WorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";

import is from "@sindresorhus/is";
import { useCallback, useState } from "react";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import { queryKeys } from "@/platform/query-keys";

export interface WorktreeDirtyPromptState {
  resolve: (confirmed: boolean) => void;
  status: ProjectGitStatusResult;
}

const SETUP_PROMPT = `Configure this project's worktree setup in 2code.json.

Inspect the repository and add a safe setup_script for a freshly-created worktree. Use ANGEL_SOURCE_WORKTREE_PATH for the source checkout and ANGEL_WORKTREE_PATH for the new checkout. Prefer sharing large dependency directories where safe, copy environment files only when appropriate, and do not add or execute init_script. Explain any secret-bearing paths before changing them.`;
const setupGuidanceDismissedKey = (projectId: string) =>
  `angel-engine.worktree-setup-guidance-dismissed:${projectId}`;

export function useWorktreeDraftGuard(
  model: WorkspacePageModel,
  navigation: WorkspaceNavigation,
) {
  const {
    api,
    draftCreationLocation,
    draftCreationLocationKey,
    draftProject,
    draftProjectGitStatusQuery,
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
  const [dismissedProjectId, setDismissedProjectId] = useState<string | null>(
    null,
  );

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

      if (
        confirmed &&
        rememberWorktreeDirtyChoice &&
        !worktreeDirtyPrompt.status.worktreeSetup
      ) {
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
  const confirmProjectWorktreeCreation = useCallback(
    async (projectId: string) => {
      try {
        const status = await api.projects.gitStatus({
          projectId,
        });
        queryClient.setQueryData(
          queryKeys.projects.gitStatus(projectId),
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
        const needsDirtyConfirmation =
          status.isDirty && worktreeDirtyPromptEnabled;
        if (!needsDirtyConfirmation && !status.worktreeSetup) return true;

        const confirmed = await confirmDirtyWorktree(status);
        if (!confirmed) return false;
        return status.worktreeSetup?.digest ?? true;
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.projectActionFailed"),
          variant: "destructive",
        });
        return false;
      }
    },
    [
      api,
      confirmDirtyWorktree,
      queryClient,
      t,
      toast,
      worktreeDirtyPromptEnabled,
    ],
  );
  const ensureDraftChatCanSubmit = useCallback(async () => {
    if (draftCreationLocation !== "worktree") return true;
    if (!is.nonEmptyString(draftProject.id)) return false;
    return confirmProjectWorktreeCreation(draftProject.id);
  }, [confirmProjectWorktreeCreation, draftCreationLocation, draftProject.id]);
  const dismissSetupGuidance = useCallback(() => {
    if (is.nonEmptyString(draftProject.id)) {
      window.localStorage.setItem(
        setupGuidanceDismissedKey(draftProject.id),
        "1",
      );
      setDismissedProjectId(draftProject.id);
    }
  }, [draftProject.id]);
  const configureSetupWithAgent = useCallback(() => {
    if (!is.nonEmptyString(draftProject.id)) return;
    setDraftCreationLocation("project");
    navigation.startNewDraftSession(draftProject.id, {
      initialPrompt: SETUP_PROMPT,
    });
  }, [draftProject.id, navigation, setDraftCreationLocation]);
  const migrateLegacyInitScript = useCallback(async () => {
    if (!is.nonEmptyString(draftProject.id)) return;
    const legacy = draftProjectGitStatusQuery.data?.legacyInitScript;
    if (!legacy || legacy.length === 0) return;
    try {
      const config = await api.projects.config({ projectId: draftProject.id });
      await api.projects.updateConfig({
        ...config,
        projectId: draftProject.id,
        setupScript: legacy,
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projects.gitStatus(draftProject.id),
      });
      toast({ title: t("workspace.worktreeSetupMigrationDone") });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("notifications.projectActionFailed"),
        variant: "destructive",
      });
    }
  }, [
    api,
    draftProject.id,
    draftProjectGitStatusQuery.data?.legacyInitScript,
    queryClient,
    t,
    toast,
  ]);
  const setupGuidanceVisible =
    draftCreationLocation === "worktree" &&
    is.nonEmptyString(draftProject.id) &&
    draftProject.id !== dismissedProjectId &&
    window.localStorage.getItem(setupGuidanceDismissedKey(draftProject.id)) !==
      "1" &&
    draftProjectGitStatusQuery.data?.isGitRepository === true &&
    draftProjectGitStatusQuery.data.worktreeSetup === undefined;

  return {
    closeWorktreeDirtyPrompt,
    configureSetupWithAgent,
    confirmProjectWorktreeCreation,
    dismissSetupGuidance,
    ensureDraftChatCanSubmit,
    migrateLegacyInitScript,
    rememberWorktreeDirtyChoice,
    setDraftCreationLocation,
    setRememberWorktreeDirtyChoice,
    setupGuidanceVisible,
    setupLegacyInitScript:
      draftProjectGitStatusQuery.data?.legacyInitScript ?? [],
    worktreeDirtyPrompt,
  };
}

export type WorktreeDraftGuard = ReturnType<typeof useWorktreeDraftGuard>;
