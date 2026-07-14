import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { Chat, ChatCreationLocation } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { useApi } from "@/platform/use-api";

import {
  getEnabledAgentOptions,
  resolveEnabledAgentRuntime,
} from "@angel-engine/daemon-api/agents";
import is from "@sindresorhus/is";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useDraftChatOptions } from "@/app/workspace/use-draft-chat-options";
import { useDraftProjectContext } from "@/app/workspace/use-draft-project-context";
import { useWorkspaceDraftState } from "@/app/workspace/use-workspace-draft-state";
import {
  getProjectDisplayName,
  getWorkspaceTitle,
} from "@/app/workspace/workspace-display";
import { draftAgentConfigFromExplicitOverrides } from "@/app/workspace/workspace-draft-agent-config";
import {
  chatNotificationRoutePath,
  isChatOpenableInWorkspaceMode,
} from "@/app/workspace/workspace-route-paths";
import {
  draftRuntimeKeyFromProjectId,
  workspaceRuntimePageKey,
} from "@/app/workspace/workspace-runtime-keys";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import {
  isProjectWorkspaceMode,
  useWorkspaceUiStore,
} from "@/app/workspace/workspace-ui-store";
import { useToast } from "@/components/ui/toast";
import { useAgentCatalog } from "@/features/agents/agent-catalog-context";
import {
  chatListQueryOptions,
  chatPrewarmQueryOptions,
  chatRuntimeConfigQueryOptions,
} from "@/features/chat/api/queries";
import {
  setActiveChatRunId,
  useChatAttentionSummary,
  useChatRunConfig,
  useChatRunIsRunning,
} from "@/features/chat/state/chat-run-store";
import { useChatTabStore } from "@/features/chat/state/chat-tab-store";
import {
  projectGitStatusQueryOptions,
  projectListQueryOptions,
} from "@/features/projects/api/queries";
import { useSettingsStore } from "@/features/settings/settings-store";
import { useAgentSettings } from "@/features/settings/use-agent-settings";

const EMPTY_CHATS: Chat[] = [];
const EMPTY_PROJECTS: Project[] = [];

interface UseWorkspacePageModelOptions {
  api: ReturnType<typeof useApi>;
  draftProjectId?: string;
  routeProjectId?: string;
  selectedChatId?: string;
  settingsActive: boolean;
}

export function useWorkspacePageModel({
  api,
  draftProjectId: routeDraftProjectId,
  routeProjectId,
  selectedChatId,
  settingsActive,
}: UseWorkspacePageModelOptions) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const isMacOS = window.desktopEnvironment.platform === "darwin";
  const [agentSettings, updateAgentSettings] = useAgentSettings();
  const { availableAgentOptions } = useAgentCatalog();
  const setAgentEnabled = useSettingsStore((state) => state.setAgentEnabled);
  const sidebarOpen = useWorkspaceUiStore((state) => state.sidebarOpen);
  const sidebarOpenMobile = useWorkspaceUiStore(
    (state) => state.sidebarOpenMobile,
  );
  const rightSidebarOpen = useWorkspaceUiStore(
    (state) => state.rightSidebarOpen,
  );
  const rightSidebarWidth = useWorkspaceUiStore(
    (state) => state.rightSidebarWidth,
  );
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const lastOpenedTargets = useWorkspaceUiStore(
    (state) => state.lastOpenedTargets,
  );
  const rememberLastOpenedTarget = useWorkspaceUiStore(
    (state) => state.rememberLastOpenedTarget,
  );
  const setWorkspaceMode = useWorkspaceUiStore(
    (state) => state.setWorkspaceMode,
  );
  const setRightSidebarOpen = useWorkspaceUiStore(
    (state) => state.setRightSidebarOpen,
  );
  const setRightSidebarWidth = useWorkspaceUiStore(
    (state) => state.setRightSidebarWidth,
  );
  const setSidebarOpen = useWorkspaceUiStore((state) => state.setSidebarOpen);
  const setSidebarOpenMobile = useWorkspaceUiStore(
    (state) => state.setSidebarOpenMobile,
  );
  const toggleRightSidebar = useWorkspaceUiStore(
    (state) => state.toggleRightSidebar,
  );
  const workspaceToolHost = useWorkspaceToolStore((state) => state.host);
  const focusWorkspaceToolSurface = useWorkspaceToolStore(
    (state) => state.focusWorkspaceToolSurface,
  );
  const requestWorkspaceToolHost = useWorkspaceToolStore(
    (state) => state.requestWorkspaceToolHost,
  );
  const worktreeDirtyPromptEnabled = useSettingsStore(
    (state) => state.worktreeDirtyPromptEnabled,
  );
  const setWorktreeDirtyPromptEnabled = useSettingsStore(
    (state) => state.setWorktreeDirtyPromptEnabled,
  );
  const enabledAgentOptions = useMemo(
    () => getEnabledAgentOptions(agentSettings, availableAgentOptions),
    [agentSettings, availableAgentOptions],
  );
  const runtimeOptions = useMemo(
    () =>
      enabledAgentOptions.map((agent) => ({
        label: agent.label,
        value: agent.id,
      })),
    [enabledAgentOptions],
  );
  const isProjectMode = isProjectWorkspaceMode(workspaceMode);
  const showRightSidebar = isProjectMode;
  const previousWorkspaceModeRef = useRef(workspaceMode);
  const previousWorkspaceToolHostRef = useRef(workspaceToolHost);

  useEffect(() => {
    if (
      !isProjectWorkspaceMode(previousWorkspaceModeRef.current) &&
      isProjectWorkspaceMode(workspaceMode)
    ) {
      setRightSidebarOpen(true);
    }
    previousWorkspaceModeRef.current = workspaceMode;
  }, [setRightSidebarOpen, workspaceMode]);

  const draftState = useWorkspaceDraftState();
  const draftSessionCounterRef = useRef(0);
  const isDraftPage = !is.nonEmptyString(selectedChatId) && !settingsActive;
  const powerModeActive = workspaceMode === "power";
  const draftWorktree = useChatTabStore((state) => state.draftWorktree);
  const activePowerWorktree = useChatTabStore((state) => state.activeWorktree);
  const powerWorktreeView = useChatTabStore(
    (state) => state.activeWorktreeView,
  );
  const powerDraftContext =
    powerModeActive &&
    isDraftPage &&
    draftWorktree !== undefined &&
    routeDraftProjectId === draftWorktree.projectId
      ? draftWorktree
      : undefined;
  const powerDraftTabActive =
    powerWorktreeView === "draft" && powerDraftContext !== undefined;
  const pinnedDraftCwd = powerDraftTabActive
    ? powerDraftContext.cwd
    : undefined;
  const powerHomePageContext =
    powerModeActive &&
    powerWorktreeView === "home" &&
    activePowerWorktree !== undefined
      ? activePowerWorktree
      : undefined;

  const projectsQuery = useQuery({ ...projectListQueryOptions({ api }) });
  const chatsQuery = useQuery({ ...chatListQueryOptions({ api }) });
  const selectedChatIsRunning = useChatRunIsRunning(selectedChatId);
  const selectedChatRuntimeConfig = useChatRunConfig(selectedChatId);
  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const chats = chatsQuery.data ?? EMPTY_CHATS;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);
  const chatAttention = useChatAttentionSummary();
  const draftProject = useDraftProjectContext(
    projects,
    isDraftPage ? routeDraftProjectId : undefined,
  );
  const selectedProjectId =
    workspaceMode === "chat"
      ? undefined
      : isDraftPage
        ? draftProject.id
        : (routeProjectId ?? selectedChat?.projectId ?? undefined);
  const selectedProject = is.nonEmptyString(selectedProjectId)
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const activePowerWorktreeProject =
    powerHomePageContext !== undefined
      ? projects.find(
          (project) => project.id === powerHomePageContext.projectId,
        )
      : undefined;
  const selectedProjectPath = isDraftPage
    ? draftProject.path
    : (selectedProject?.path ?? selectedChat?.cwd);
  const selectedProjectName = isDraftPage
    ? draftProject.name
    : is.nonEmptyString(selectedProjectPath)
      ? getProjectDisplayName(selectedProjectPath)
      : undefined;
  const workspaceToolRoot =
    is.nonEmptyString(selectedChatId) &&
    is.nonEmptyString(selectedChat?.projectId)
      ? (selectedChat.cwd ?? selectedProjectPath)
      : undefined;
  const canShowRightSidebar =
    showRightSidebar && is.nonEmptyString(workspaceToolRoot);
  const dockedWorkspaceToolContext =
    canShowRightSidebar &&
    workspaceToolHost === "sidebar" &&
    is.nonEmptyString(selectedChatId) &&
    is.nonEmptyString(workspaceToolRoot)
      ? { chatId: selectedChatId, root: workspaceToolRoot }
      : null;

  useEffect(() => {
    if (
      previousWorkspaceToolHostRef.current !== "sidebar" &&
      workspaceToolHost === "sidebar" &&
      canShowRightSidebar &&
      is.nonEmptyString(selectedChatId) &&
      is.nonEmptyString(workspaceToolRoot)
    ) {
      setRightSidebarOpen(true);
    }
    previousWorkspaceToolHostRef.current = workspaceToolHost;
  }, [
    canShowRightSidebar,
    selectedChatId,
    setRightSidebarOpen,
    workspaceToolHost,
    workspaceToolRoot,
  ]);
  const toggleWorkspaceTools = useCallback(() => {
    if (workspaceToolHost !== "sidebar") {
      focusWorkspaceToolSurface();
      return;
    }
    toggleRightSidebar();
  }, [focusWorkspaceToolSurface, toggleRightSidebar, workspaceToolHost]);
  const workspaceToolsToggleLabel =
    workspaceToolHost !== "sidebar"
      ? "Focus workspace tools"
      : rightSidebarOpen
        ? "Hide workspace tools"
        : "Show workspace tools";
  const workspaceTitle = getWorkspaceTitle({
    selectedChat,
    selectedProjectName,
    settingsActive,
    t,
  });
  const chatRuntime = selectedChat?.runtime as AgentRuntime | undefined;
  const draftRuntimeKey = isDraftPage
    ? draftRuntimeKeyFromProjectId(routeDraftProjectId)
    : undefined;
  const draftCreationLocationKey = draftRuntimeKey ?? "standalone";
  const requestedDraftCreationLocation =
    draftState.draftCreationLocations[draftCreationLocationKey] ?? "project";
  const runtimePageKey = workspaceRuntimePageKey({
    chatRuntime,
    draftProjectId: routeDraftProjectId,
    draftSessionId: is.nonEmptyString(draftRuntimeKey)
      ? draftState.draftSessionIds[draftRuntimeKey]
      : undefined,
    selectedChatId,
    settingsActive,
  });
  const draftRuntime = is.nonEmptyString(draftRuntimeKey)
    ? resolveEnabledAgentRuntime(
        agentSettings,
        draftState.draftRuntimes[draftRuntimeKey],
        availableAgentOptions,
      )
    : resolveEnabledAgentRuntime(
        agentSettings,
        undefined,
        availableAgentOptions,
      );
  const activeRuntime = chatRuntime ?? draftRuntime;
  const draftProjectGitStatusQuery = useQuery({
    ...projectGitStatusQueryOptions({
      api,
      enabled: isDraftPage && isProjectMode && draftProject.id !== undefined,
      projectId: draftProject.id,
    }),
  });
  const canCreateDraftWorktree =
    isDraftPage &&
    isProjectMode &&
    pinnedDraftCwd === undefined &&
    draftProjectGitStatusQuery.data?.isGitRepository === true;
  const draftCreationLocation: ChatCreationLocation = canCreateDraftWorktree
    ? requestedDraftCreationLocation
    : "project";
  const shouldPrewarmChat =
    isDraftPage &&
    (!is.nonEmptyString(routeDraftProjectId) ||
      is.nonEmptyString(draftProject.path));
  const prewarmQuery = useQuery({
    ...chatPrewarmQueryOptions({
      api,
      creationLocation: draftCreationLocation,
      enabled:
        shouldPrewarmChat &&
        draftCreationLocation !== "worktree" &&
        pinnedDraftCwd === undefined,
      projectId: draftProject.id,
      runtime: activeRuntime,
    }),
  });
  const inspectDraftRuntimeConfig =
    draftCreationLocation === "worktree" || pinnedDraftCwd !== undefined;
  const shouldInspectDraftRuntimeConfig =
    isDraftPage && inspectDraftRuntimeConfig && draftProject.path !== undefined;
  const draftRuntimeConfigQuery = useQuery({
    ...chatRuntimeConfigQueryOptions({
      api,
      cwd: pinnedDraftCwd ?? draftProject.path,
      enabled: shouldInspectDraftRuntimeConfig,
      runtime: activeRuntime,
    }),
  });
  const runtimeConfig = inspectDraftRuntimeConfig
    ? draftRuntimeConfigQuery.data
    : prewarmQuery.data?.config;
  const runtimeConfigLoading = inspectDraftRuntimeConfig
    ? draftRuntimeConfigQuery.isFetching
    : prewarmQuery.isFetching;
  const draftChatOptions = useDraftChatOptions({
    activeRuntime,
    agentSettings,
    configLoading: runtimeConfigLoading,
    draftAgentConfigs: draftState.draftAgentConfigs,
    draftRuntimeKey,
    runtimeConfig,
    runtimeOptions,
    runtimePageKey,
    setDraftAgentConfigs: draftState.setDraftAgentConfigs,
    setDraftRuntimes: draftState.setDraftRuntimes,
  });
  const selectedChatAgentConfig =
    draftAgentConfigFromExplicitOverrides({
      mode: draftChatOptions.modeOverride,
      model: draftChatOptions.modelOverride,
      permissionMode: draftChatOptions.permissionModeOverride,
      reasoningEffort: draftChatOptions.reasoningEffortOverride,
    }) ?? draftChatOptions.draftAgentConfig;

  useEffect(() => {
    setActiveChatRunId(selectedChatId);
    window.desktopWindow.setActiveChatId(selectedChatId ?? null);
  }, [selectedChatId]);

  useEffect(() => {
    if (
      selectedChat &&
      isChatOpenableInWorkspaceMode(selectedChat, workspaceMode)
    ) {
      rememberLastOpenedTarget(workspaceMode, {
        chatId: selectedChat.id,
        type: "chat",
      });
      return;
    }
    if (isDraftPage) {
      rememberLastOpenedTarget(
        workspaceMode,
        isProjectWorkspaceMode(workspaceMode) &&
          routeDraftProjectId !== undefined
          ? { projectId: routeDraftProjectId, type: "draft" }
          : { type: "draft" },
      );
    }
  }, [
    isDraftPage,
    rememberLastOpenedTarget,
    routeDraftProjectId,
    selectedChat,
    workspaceMode,
  ]);

  useEffect(
    () =>
      window.desktopWindow.onOpenChatFromNotification((event) => {
        navigate(chatNotificationRoutePath(event));
      }),
    [navigate],
  );

  const projectChatsByProjectId = useMemo(() => {
    const groupedChats = new Map<string, Chat[]>();
    for (const chat of chats) {
      if (!is.nonEmptyString(chat.projectId)) continue;
      const projectChats = groupedChats.get(chat.projectId);
      if (projectChats) {
        projectChats.push(chat);
        continue;
      }
      groupedChats.set(chat.projectId, [chat]);
    }
    return groupedChats;
  }, [chats]);

  return {
    ...draftState,
    ...draftChatOptions,
    activePowerWorktree,
    activePowerWorktreeProject,
    activeRuntime,
    agentSettings,
    api,
    availableAgentOptions,
    canCreateDraftWorktree,
    canShowRightSidebar,
    chatAttention,
    chats,
    chatsQuery,
    dockedWorkspaceToolContext,
    draftCreationLocation,
    draftCreationLocationKey,
    draftProject,
    draftSessionCounterRef,
    isDraftPage,
    isMacOS,
    isProjectMode,
    lastOpenedTargets,
    location,
    navigate,
    pinnedDraftCwd,
    powerDraftContext,
    powerDraftTabActive,
    powerHomePageContext,
    powerModeActive,
    prewarmQuery,
    projectChatsByProjectId,
    projects,
    projectsQuery,
    queryClient,
    requestWorkspaceToolHost,
    rightSidebarOpen,
    rightSidebarWidth,
    routeDraftProjectId,
    routeProjectId,
    runtimeConfig,
    runtimeOptions,
    runtimePageKey,
    selectedChat,
    selectedChatAgentConfig,
    selectedChatId,
    selectedChatIsRunning,
    selectedChatRuntimeConfig,
    selectedProjectId,
    selectedProjectName,
    setAgentEnabled,
    setRightSidebarWidth,
    setSidebarOpen,
    setSidebarOpenMobile,
    setWorkspaceMode,
    setWorktreeDirtyPromptEnabled,
    settingsActive,
    sidebarOpen,
    sidebarOpenMobile,
    t,
    toast,
    toggleWorkspaceTools,
    updateAgentSettings,
    workspaceMode,
    workspaceToolHost,
    workspaceToolRoot,
    workspaceTitle,
    workspaceToolsToggleLabel,
    worktreeDirtyPromptEnabled,
  };
}

export type WorkspacePageModel = ReturnType<typeof useWorkspacePageModel>;
