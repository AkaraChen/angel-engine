import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { Chat } from "@angel-engine/daemon-api/chat";
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
import { chatNotificationRoutePath } from "@/app/workspace/workspace-route-paths";
import {
  draftRuntimeKeyFromProjectId,
  workspaceRuntimePageKey,
} from "@/app/workspace/workspace-runtime-keys";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import { resolveWorkspaceToolContext } from "@/app/workspace/workspace-tool-context";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { useToast } from "@/components/ui/toast";
import { useAgentCatalog } from "@/features/agents/agent-catalog-context";
import {
  chatListQueryOptions,
  chatPrewarmQueryOptions,
  chatRuntimeConfigQueryOptions,
} from "@/features/chat/api/queries";
import { sortChatsPinnedFirst } from "@/features/chat/chat-order";
import {
  setActiveChatRunId,
  useChatAttentionSummary,
  useChatRunConfig,
  useChatRunIsRunning,
} from "@/features/chat/state/chat-run-store";
import { projectListQueryOptions } from "@/features/projects/api/queries";
import { useAgentSettings } from "@/features/settings/use-agent-settings";

const EMPTY_CHATS: Chat[] = [];
const EMPTY_PROJECTS: Project[] = [];

interface UseWorkspacePageModelOptions {
  api: ReturnType<typeof useApi>;
  draftProjectId?: string;
  /** The Fleet overview owns the main pane; no draft composer is mounted. */
  fleetActive?: boolean;
  /** Schedule owns the main pane and must not prewarm a draft session. */
  scheduleActive?: boolean;
  routeProjectId?: string;
  selectedChatId?: string;
}

export function useWorkspacePageModel({
  api,
  draftProjectId: routeDraftProjectId,
  fleetActive = false,
  scheduleActive = false,
  routeProjectId,
  selectedChatId,
}: UseWorkspacePageModelOptions) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const isMacOS = window.desktopEnvironment.platform === "darwin";
  const [agentSettings, updateAgentSettings] = useAgentSettings();
  const { availableAgentOptions } = useAgentCatalog();
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
  const workspaceToolHost = "sidebar" as const;
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
  const showRightSidebar = true;
  const previousWorkspaceToolHostRef = useRef(workspaceToolHost);

  const draftState = useWorkspaceDraftState();
  const draftSessionCounterRef = useRef(0);
  // Fleet and Schedule are chat-less routes but not drafts.
  const isDraftPage =
    !fleetActive && !scheduleActive && !is.nonEmptyString(selectedChatId);
  const pinnedDraftCwd =
    draftState.draftCwds[
      draftRuntimeKeyFromProjectId(routeDraftProjectId) ?? "standalone"
    ];

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
  const selectedProjectId = isDraftPage
    ? draftProject.id
    : (routeProjectId ?? selectedChat?.projectId ?? undefined);
  const selectedProject = is.nonEmptyString(selectedProjectId)
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const selectedProjectPath = isDraftPage
    ? draftProject.path
    : (selectedProject?.path ?? selectedChat?.cwd);
  const selectedProjectName = isDraftPage
    ? draftProject.name
    : is.nonEmptyString(selectedProjectPath)
      ? getProjectDisplayName(selectedProjectPath)
      : undefined;
  const projectWorkspaceToolRoot = selectedProjectPath;
  const workspaceToolContext = resolveWorkspaceToolContext({
    projectId: selectedChat?.projectId ?? selectedProjectId,
    projectRoot:
      is.nonEmptyString(selectedChat?.projectId) &&
      is.nonEmptyString(selectedChatId)
        ? (selectedChat.cwd ?? projectWorkspaceToolRoot ?? undefined)
        : (projectWorkspaceToolRoot ?? undefined),
    selectedChatId,
    selectedChatProjectId: selectedChat?.projectId ?? undefined,
  });
  const workspaceToolContextKey = workspaceToolContext?.contextKey;
  const workspaceToolRoot = workspaceToolContext?.root;
  const canShowRightSidebar = showRightSidebar && workspaceToolContext !== null;
  const dockedWorkspaceToolContext =
    canShowRightSidebar &&
    workspaceToolHost === "sidebar" &&
    is.nonEmptyString(workspaceToolContextKey) &&
    is.nonEmptyString(workspaceToolRoot)
      ? { contextKey: workspaceToolContextKey, root: workspaceToolRoot }
      : null;

  useEffect(() => {
    if (
      previousWorkspaceToolHostRef.current !== "sidebar" &&
      workspaceToolHost === "sidebar" &&
      canShowRightSidebar &&
      is.nonEmptyString(workspaceToolContextKey) &&
      is.nonEmptyString(workspaceToolRoot)
    ) {
      setRightSidebarOpen(true);
    }
    previousWorkspaceToolHostRef.current = workspaceToolHost;
  }, [
    canShowRightSidebar,
    setRightSidebarOpen,
    workspaceToolHost,
    workspaceToolContextKey,
    workspaceToolRoot,
  ]);
  const toggleWorkspaceTools = useCallback(() => {
    toggleRightSidebar();
  }, [toggleRightSidebar]);
  const workspaceToolsToggleLabel =
    workspaceToolHost !== "sidebar"
      ? t("workspace.rightSidebar.focus")
      : rightSidebarOpen
        ? t("workspace.rightSidebar.hide")
        : t("workspace.rightSidebar.show");
  const workspaceTitle = getWorkspaceTitle({
    selectedChat,
    selectedProjectName,
    t,
  });
  const chatRuntime = selectedChat?.runtime as AgentRuntime | undefined;
  const draftRuntimeKey = isDraftPage
    ? draftRuntimeKeyFromProjectId(routeDraftProjectId)
    : undefined;
  const runtimePageKey = workspaceRuntimePageKey({
    chatRuntime,
    draftProjectId: routeDraftProjectId,
    draftSessionId: is.nonEmptyString(draftRuntimeKey)
      ? draftState.draftSessionIds[draftRuntimeKey]
      : undefined,
    selectedChatId,
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
  const shouldPrewarmChat =
    isDraftPage &&
    (!is.nonEmptyString(routeDraftProjectId) ||
      is.nonEmptyString(draftProject.path));
  const prewarmQuery = useQuery({
    ...chatPrewarmQueryOptions({
      api,
      enabled: shouldPrewarmChat && pinnedDraftCwd === undefined,
      projectId: draftProject.id,
      runtime: activeRuntime,
    }),
  });
  const inspectDraftRuntimeConfig = pinnedDraftCwd !== undefined;
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
    for (const [projectId, projectChats] of groupedChats) {
      groupedChats.set(projectId, sortChatsPinnedFirst(projectChats));
    }
    return groupedChats;
  }, [chats]);

  return {
    ...draftState,
    ...draftChatOptions,
    activeRuntime,
    api,
    canShowRightSidebar,
    chatAttention,
    chats,
    chatsQuery,
    dockedWorkspaceToolContext,
    draftProject,
    draftSessionCounterRef,
    isDraftPage,
    isMacOS,
    initialDraftPrompt: draftState.draftInitialPrompts[runtimePageKey] ?? "",
    location,
    navigate,
    pinnedDraftCwd,
    prewarmQuery,
    projectChatsByProjectId,
    projects,
    projectsQuery,
    queryClient,
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
    setRightSidebarWidth,
    setRightSidebarOpen,
    setSidebarOpen,
    setSidebarOpenMobile,
    sidebarOpen,
    sidebarOpenMobile,
    t,
    toast,
    toggleWorkspaceTools,
    updateAgentSettings,
    workspaceToolHost,
    workspaceToolContextKey,
    workspaceToolRoot,
    workspaceTitle,
    workspaceToolsToggleLabel,
  };
}

export type WorkspacePageModel = ReturnType<typeof useWorkspacePageModel>;
