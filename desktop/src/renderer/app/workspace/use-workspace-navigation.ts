import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";

import is from "@sindresorhus/is";
import { useCallback } from "react";
import {
  draftAgentConfigFromExplicitOverrides,
  optionalString,
} from "@/app/workspace/workspace-draft-agent-config";
import {
  chatRoutePath,
  projectDraftRoutePath,
} from "@/app/workspace/workspace-route-paths";
import {
  draftAgentConfigKey,
  draftRuntimeKeyFromProjectId,
  workspaceRuntimePageKey,
} from "@/app/workspace/workspace-runtime-keys";

export function useWorkspaceNavigation(model: WorkspacePageModel) {
  const {
    activeRuntime,
    chats,
    draftSessionCounterRef,
    isDraftPage,
    location,
    modeOverride,
    modelOverride,
    navigate,
    permissionModeOverride,
    projects,
    reasoningEffortOverride,
    routeDraftProjectId,
    selectedChatRuntimeConfig,
    setDraftAgentConfigs,
    setDraftInitialPrompts,
    setDraftRuntimes,
    setDraftSessionIds,
  } = model;

  const navigateToChat = useCallback(
    (chat: Chat, options?: { replace?: boolean }) => {
      const path = chatRoutePath(chat, {
        includeProject: true,
      });
      if (location !== path) {
        navigate(path, options);
      }
    },
    [location, navigate],
  );

  const navigateToDraft = useCallback(
    (projectId?: string, options?: { replace?: boolean }) => {
      const path = is.nonEmptyString(projectId)
        ? projectDraftRoutePath(projectId)
        : "/";
      if (location !== path) {
        navigate(path, options);
      }
    },
    [location, navigate],
  );

  const startNewDraftSession = useCallback(
    (
      projectId?: string,
      options?: { initialPrompt?: string; replace?: boolean },
    ) => {
      const nextDraftRuntimeKey = draftRuntimeKeyFromProjectId(projectId);
      const nextSessionId = ++draftSessionCounterRef.current;
      const nextRuntimePageKey = workspaceRuntimePageKey({
        draftProjectId: projectId,
        draftSessionId: nextSessionId,
      });
      const inheritedConfig = draftAgentConfigFromExplicitOverrides({
        mode: optionalString(
          modeOverride ??
            selectedChatRuntimeConfig?.agentState?.currentMode ??
            selectedChatRuntimeConfig?.currentMode,
        ),
        model: optionalString(
          modelOverride ?? selectedChatRuntimeConfig?.currentModel,
        ),
        permissionMode: optionalString(
          permissionModeOverride ??
            selectedChatRuntimeConfig?.agentState?.currentPermissionMode ??
            selectedChatRuntimeConfig?.currentPermissionMode,
        ),
        reasoningEffort: optionalString(
          reasoningEffortOverride ??
            selectedChatRuntimeConfig?.currentReasoningEffort,
        ),
      });

      setDraftRuntimes((current) => ({
        ...current,
        [nextDraftRuntimeKey]: activeRuntime,
      }));
      setDraftSessionIds((current) => ({
        ...current,
        [nextDraftRuntimeKey]: nextSessionId,
      }));
      if (is.nonEmptyString(options?.initialPrompt)) {
        setDraftInitialPrompts((current) => ({
          ...current,
          [nextRuntimePageKey]: options.initialPrompt,
        }));
      }
      if (inheritedConfig) {
        setDraftAgentConfigs((current) => ({
          ...current,
          [draftAgentConfigKey(nextRuntimePageKey, activeRuntime)]:
            inheritedConfig,
        }));
      }
      navigateToDraft(
        projectId,
        options?.replace === undefined
          ? undefined
          : { replace: options.replace },
      );
    },
    [
      activeRuntime,
      draftSessionCounterRef,
      modeOverride,
      modelOverride,
      navigateToDraft,
      permissionModeOverride,
      reasoningEffortOverride,
      selectedChatRuntimeConfig,
      setDraftAgentConfigs,
      setDraftInitialPrompts,
      setDraftRuntimes,
      setDraftSessionIds,
    ],
  );

  const createChatForProject = useCallback(
    (project: Project) => {
      if (isDraftPage && routeDraftProjectId === project.id) return;
      startNewDraftSession(project.id);
    },
    [isDraftPage, routeDraftProjectId, startNewDraftSession],
  );

  const createChatForSelection = useCallback(() => {
    if (isDraftPage) return;
    startNewDraftSession();
  }, [isDraftPage, startNewDraftSession]);

  const createStandaloneWorkspace = useCallback(() => {
    startNewDraftSession();
  }, [startNewDraftSession]);

  const selectDraftProject = useCallback(
    (projectId: string) => {
      navigateToDraft(projectId);
    },
    [navigateToDraft],
  );


  const openChatFromAnyMode = useCallback(
    (chat: Chat) => {
      const path = chatRoutePath(chat, { includeProject: true });
      if (location !== path) navigate(path);
    },
    [location, navigate],
  );

  const openSettings = useCallback(() => {
    window.desktopWindow.openSettings();
  }, []);
  const openChat = useCallback(
    (chat: Chat) => {
      navigateToChat(chat);
    },
    [navigateToChat],
  );

  return {
    createChatForProject,
    createChatForSelection,
    createStandaloneWorkspace,
    navigateToChat,
    navigateToDraft,
    openChat,
    openChatFromAnyMode,
    openSettings,
    selectDraftProject,
    startNewDraftSession,
  };
}

export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;
