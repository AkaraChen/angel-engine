import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";
import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";
import type { ProjectWorktreeChatGroup } from "@/features/chat/worktree-grouping";

import is from "@sindresorhus/is";
import { useCallback } from "react";
import {
  draftAgentConfigFromExplicitOverrides,
  optionalString,
} from "@/app/workspace/workspace-draft-agent-config";
import {
  chatRoutePath,
  lastOpenedTargetPath,
  projectDraftRoutePath,
} from "@/app/workspace/workspace-route-paths";
import {
  draftAgentConfigKey,
  draftRuntimeKeyFromProjectId,
  workspaceRuntimePageKey,
} from "@/app/workspace/workspace-runtime-keys";
import { isProjectWorkspaceMode } from "@/app/workspace/workspace-ui-store";
import {
  openChatTab,
  setPowerActiveWorktree,
  setPowerDraftWorktree,
  setPowerWorktreeView,
} from "@/features/chat/state/chat-tab-store";
import {
  chatWorktreeCwd,
  chatWorktreeGroupKey,
} from "@/features/chat/worktree-grouping";

export function useWorkspaceNavigation(model: WorkspacePageModel) {
  const {
    activePowerWorktree,
    activeRuntime,
    chats,
    draftSessionCounterRef,
    isDraftPage,
    lastOpenedTargets,
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
    setDraftRuntimes,
    setDraftSessionIds,
    setWorkspaceMode,
    workspaceMode,
  } = model;

  const registerChatTab = useCallback(
    (chat: Chat, mode: WorkspaceMode) => {
      if (mode !== "power" || !is.nonEmptyString(chat.projectId)) return;

      const project = projects.find((item) => item.id === chat.projectId);
      const groupKey = chatWorktreeGroupKey(chat, project?.path);
      if (groupKey !== undefined) {
        setPowerActiveWorktree({
          cwd: chatWorktreeCwd(chat, project?.path),
          groupKey,
          projectId: chat.projectId,
        });
        setPowerWorktreeView(null);
        openChatTab(groupKey, chat.id);
      }
    },
    [projects],
  );

  const navigateToChat = useCallback(
    (chat: Chat, options?: { replace?: boolean }) => {
      setPowerDraftWorktree(undefined);
      registerChatTab(chat, workspaceMode);
      const path = chatRoutePath(chat, {
        includeProject: isProjectWorkspaceMode(workspaceMode),
      });
      if (location !== path) {
        navigate(path, options);
      }
    },
    [location, navigate, registerChatTab, workspaceMode],
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

  const openPowerWorktree = useCallback(
    (project: Project, worktreeGroup: ProjectWorktreeChatGroup) => {
      setPowerDraftWorktree(undefined);
      setPowerActiveWorktree({
        cwd: worktreeGroup.cwd,
        groupKey: worktreeGroup.key,
        projectId: project.id,
      });
      setPowerWorktreeView("home");
      navigateToDraft(project.id);
    },
    [navigateToDraft],
  );

  const startNewDraftSession = useCallback(
    (projectId?: string, options?: { replace?: boolean }) => {
      const nextDraftRuntimeKey = draftRuntimeKeyFromProjectId(projectId);
      const nextSessionId = ++draftSessionCounterRef.current;
      const nextRuntimePageKey = workspaceRuntimePageKey({
        draftProjectId: projectId,
        draftSessionId: nextSessionId,
        settingsActive: false,
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
      if (inheritedConfig) {
        setDraftAgentConfigs((current) => ({
          ...current,
          [draftAgentConfigKey(nextRuntimePageKey, activeRuntime)]:
            inheritedConfig,
        }));
      }
      navigateToDraft(projectId, options);
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
      setDraftRuntimes,
      setDraftSessionIds,
    ],
  );

  const changeWorkspaceMode = useCallback(
    (nextWorkspaceMode: WorkspaceMode) => {
      if (nextWorkspaceMode === workspaceMode) return;

      setPowerDraftWorktree(undefined);
      setWorkspaceMode(nextWorkspaceMode);

      if (nextWorkspaceMode === "power" && activePowerWorktree !== undefined) {
        setPowerWorktreeView("home");
        navigateToDraft(activePowerWorktree.projectId, { replace: true });
        return;
      }

      setPowerWorktreeView(null);
      const target = lastOpenedTargets[nextWorkspaceMode];
      const path = lastOpenedTargetPath({
        chats,
        target,
        workspaceMode: nextWorkspaceMode,
      });
      if (path !== undefined) {
        if (target?.type === "chat") {
          const targetChat = chats.find((chat) => chat.id === target.chatId);
          if (targetChat) registerChatTab(targetChat, nextWorkspaceMode);
        }
        if (location !== path) {
          navigate(path, { replace: true });
        }
        return;
      }

      startNewDraftSession(undefined, { replace: true });
    },
    [
      chats,
      activePowerWorktree,
      lastOpenedTargets,
      location,
      navigate,
      navigateToDraft,
      registerChatTab,
      setWorkspaceMode,
      startNewDraftSession,
      workspaceMode,
    ],
  );

  const createChatForProject = useCallback(
    (project: Project) => {
      setPowerDraftWorktree(undefined);
      setPowerActiveWorktree(undefined);
      setPowerWorktreeView(null);
      if (isDraftPage && routeDraftProjectId === project.id) return;
      startNewDraftSession(project.id);
    },
    [isDraftPage, routeDraftProjectId, startNewDraftSession],
  );

  const createChatForSelection = useCallback(() => {
    setPowerDraftWorktree(undefined);
    setPowerActiveWorktree(undefined);
    setPowerWorktreeView(null);
    if (isDraftPage) return;
    startNewDraftSession();
  }, [isDraftPage, startNewDraftSession]);

  const selectDraftProject = useCallback(
    (projectId: string | null) => {
      setPowerDraftWorktree(undefined);
      setPowerActiveWorktree(undefined);
      setPowerWorktreeView(null);
      navigateToDraft(projectId ?? undefined);
    },
    [navigateToDraft],
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
    changeWorkspaceMode,
    createChatForProject,
    createChatForSelection,
    navigateToChat,
    navigateToDraft,
    openChat,
    openPowerWorktree,
    openSettings,
    registerChatTab,
    selectDraftProject,
    startNewDraftSession,
  };
}

export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;
