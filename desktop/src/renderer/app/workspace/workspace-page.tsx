import type { AgentRuntime, AgentRuntimePreference } from "@shared/agents";
import type {
  Chat,
  ChatCreationLocation,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatRuntimeConfig,
} from "@shared/chat";
import type { Project, ProjectGitStatusResult } from "@shared/projects";
import type { SetStateAction } from "react";
import type {
  ChatRunOrigin,
  DraftAgentConfig,
} from "@/app/workspace/workspace-thread-types";

import {
  getEnabledAgentOptions,
  isAgentRuntime,
  rememberAgentOrder,
  rememberAgentRuntimePreference,
  resolveEnabledAgentRuntime,
  sanitizeAgentRuntimePreference,
} from "@shared/agents";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Redirect, useLocation } from "wouter";
import { ChatRestoreLoading } from "@/app/workspace/chat-restore-loading";
import { DraftCreationLocationSelect } from "@/app/workspace/draft-project-select";
import { NewChatThread } from "@/app/workspace/new-chat-thread";
import { useDraftChatOptions } from "@/app/workspace/use-draft-chat-options";
import { useDraftProjectContext } from "@/app/workspace/use-draft-project-context";
import {
  ActiveChatThread,
  ChatRestoreErrorBoundary,
  RestoredChatThread,
} from "@/app/workspace/workspace-chat-thread";
import {
  getErrorMessage,
  getProjectDisplayName,
  getWorkspaceTitle,
} from "@/app/workspace/workspace-display";
import { WorkspaceHeader } from "@/app/workspace/workspace-header";
import { WorkspaceRightSidebar } from "@/app/workspace/workspace-right-sidebar";
import {
  chatNotificationRoutePath,
  chatRoutePath,
  chatRoutePathId,
  currentHashRoutePath,
  projectChatRoutePath,
  projectDraftRoutePath,
} from "@/app/workspace/workspace-route-paths";
import {
  draftAgentConfigKey,
  draftRuntimeKeyFromProjectId,
  workspaceRuntimePageKey,
} from "@/app/workspace/workspace-runtime-keys";
import {
  WorkspaceFloatingSidebar,
  WorkspaceSidebar,
} from "@/app/workspace/workspace-sidebar";
import {
  WorkspaceSidebarControl,
  WorkspaceSidebarControlPortalProvider,
} from "@/app/workspace/workspace-sidebar-control";
import {
  WorkspaceToolContextBridge,
  WorkspaceToolSurfaceHostControls,
} from "@/app/workspace/workspace-tool-host";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useToast } from "@/components/ui/toast";
import {
  archiveChatMutationOptions,
  chatContextMenuMutationOptions,
  chatListQueryOptions,
  chatPrewarmQueryOptions,
  chatRuntimeConfigQueryOptions,
  deleteAllChatsMutationOptions,
  invalidateChatQueries,
  renameChatMutationOptions,
  setChatRuntimeMutationOptions,
} from "@/features/chat/api/queries";
import {
  broadcastAllChatsDeleted,
  broadcastChatsChanged,
  subscribeToChatMetadataEvents,
} from "@/features/chat/chat-metadata-events";
import { RenameChatDialog } from "@/features/chat/components/rename-chat-dialog";
import {
  cancelAllChatRuns,
  cancelChatRun,
  setActiveChatRunId,
  useChatAttentionSummary,
  useChatRunConfig,
  useChatRunIsRunning,
} from "@/features/chat/state/chat-run-store";
import {
  createProjectMutationOptions,
  projectContextMenuMutationOptions,
  projectGitStatusQueryOptions,
  projectListQueryOptions,
} from "@/features/projects/api/queries";
import { SettingsPage } from "@/features/settings/settings-page";
import { useSettingsStore } from "@/features/settings/settings-store";
import { useAgentSettings } from "@/features/settings/use-agent-settings";
import { queryKeys } from "@/platform/query-keys";
import { useApi } from "@/platform/use-api";

const EMPTY_CHATS: Chat[] = [];
const EMPTY_PROJECTS: Project[] = [];

interface WorkspaceDraftState {
  agentConfigs: Partial<Record<string, DraftAgentConfig>>;
  creationLocations: Partial<Record<string, ChatCreationLocation>>;
  runtimes: Partial<Record<string, AgentRuntime>>;
  sessionIds: Partial<Record<string, number>>;
}

type WorkspaceDraftStateAction =
  | {
      action: SetStateAction<WorkspaceDraftState["agentConfigs"]>;
      type: "agentConfigs";
    }
  | {
      action: SetStateAction<WorkspaceDraftState["creationLocations"]>;
      type: "creationLocations";
    }
  | {
      action: SetStateAction<WorkspaceDraftState["runtimes"]>;
      type: "runtimes";
    }
  | {
      action: SetStateAction<WorkspaceDraftState["sessionIds"]>;
      type: "sessionIds";
    };

const emptyWorkspaceDraftState: WorkspaceDraftState = {
  agentConfigs: {},
  creationLocations: {},
  runtimes: {},
  sessionIds: {},
};

function applyWorkspaceDraftSetState<T>(
  current: T,
  action: SetStateAction<T>,
): T {
  return typeof action === "function"
    ? (action as (current: T) => T)(current)
    : action;
}

function workspaceDraftStateReducer(
  state: WorkspaceDraftState,
  action: WorkspaceDraftStateAction,
): WorkspaceDraftState {
  switch (action.type) {
    case "agentConfigs":
      return {
        ...state,
        agentConfigs: applyWorkspaceDraftSetState(
          state.agentConfigs,
          action.action,
        ),
      };
    case "creationLocations":
      return {
        ...state,
        creationLocations: applyWorkspaceDraftSetState(
          state.creationLocations,
          action.action,
        ),
      };
    case "runtimes":
      return {
        ...state,
        runtimes: applyWorkspaceDraftSetState(state.runtimes, action.action),
      };
    case "sessionIds":
      return {
        ...state,
        sessionIds: applyWorkspaceDraftSetState(
          state.sessionIds,
          action.action,
        ),
      };
  }
}

interface WorkspacePageContentProps {
  api: ReturnType<typeof useApi>;
  currentRoutePath: string;
  draftProjectId?: string;
  routeProjectId?: string;
  selectedChatId?: string;
  settingsActive?: boolean;
}

interface WorktreeDirtyPromptState {
  resolve: (confirmed: boolean) => void;
  status: ProjectGitStatusResult;
}

export function WorkspaceDraftPage({ projectId }: { projectId?: string }) {
  const api = useApi();

  return (
    <WorkspacePageContent
      api={api}
      currentRoutePath={
        is.nonEmptyString(projectId) ? projectDraftRoutePath(projectId) : "/"
      }
      draftProjectId={projectId}
    />
  );
}

export function WorkspaceChatPage({
  chatId,
  projectId,
}: {
  chatId: string;
  projectId?: string;
}) {
  const api = useApi();

  return (
    <WorkspacePageContent
      api={api}
      currentRoutePath={
        is.nonEmptyString(projectId)
          ? projectChatRoutePath(projectId, chatId)
          : chatRoutePathId(chatId)
      }
      routeProjectId={projectId}
      selectedChatId={chatId}
    />
  );
}

function WorkspacePageContent({
  api,
  currentRoutePath,
  draftProjectId: routeDraftProjectId,
  routeProjectId,
  selectedChatId,
  settingsActive = false,
}: WorkspacePageContentProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const isMacOS = window.desktopEnvironment.platform === "darwin";
  const [agentSettings, updateAgentSettings] = useAgentSettings();
  const availableAgentOptions = useSettingsStore(
    (state) => state.availableAgentOptions,
  );
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
  const showRightSidebar = workspaceMode === "work";
  const previousWorkspaceModeRef = useRef(workspaceMode);
  const previousWorkspaceToolHostRef = useRef(workspaceToolHost);

  useEffect(() => {
    if (
      previousWorkspaceModeRef.current !== "work" &&
      workspaceMode === "work"
    ) {
      setRightSidebarOpen(true);
    }
    previousWorkspaceModeRef.current = workspaceMode;
  }, [setRightSidebarOpen, workspaceMode]);
  const [draftState, dispatchDraftState] = useReducer(
    workspaceDraftStateReducer,
    emptyWorkspaceDraftState,
  );
  const {
    agentConfigs: draftAgentConfigs,
    creationLocations: draftCreationLocations,
    runtimes: draftRuntimes,
    sessionIds: draftSessionIds,
  } = draftState;
  const setDraftAgentConfigs = useCallback(
    (action: SetStateAction<WorkspaceDraftState["agentConfigs"]>) =>
      dispatchDraftState({ action, type: "agentConfigs" }),
    [],
  );
  const setDraftCreationLocations = useCallback(
    (action: SetStateAction<WorkspaceDraftState["creationLocations"]>) =>
      dispatchDraftState({ action, type: "creationLocations" }),
    [],
  );
  const setDraftRuntimes = useCallback(
    (action: SetStateAction<WorkspaceDraftState["runtimes"]>) =>
      dispatchDraftState({ action, type: "runtimes" }),
    [],
  );
  const setDraftSessionIds = useCallback(
    (action: SetStateAction<WorkspaceDraftState["sessionIds"]>) =>
      dispatchDraftState({ action, type: "sessionIds" }),
    [],
  );
  const [worktreeDirtyPrompt, setWorktreeDirtyPrompt] =
    useState<WorktreeDirtyPromptState | null>(null);
  const [rememberWorktreeDirtyChoice, setRememberWorktreeDirtyChoice] =
    useState(false);
  const draftSessionCounterRef = useRef(0);
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const isDraftPage = !is.nonEmptyString(selectedChatId) && !settingsActive;

  const projectsQuery = useQuery({
    ...projectListQueryOptions({ api }),
  });
  const chatsQuery = useQuery({
    ...chatListQueryOptions({ api }),
  });
  const selectedChatIsRunning = useChatRunIsRunning(selectedChatId);
  const selectedChatRuntimeConfig = useChatRunConfig(selectedChatId);

  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const chats = chatsQuery.data ?? EMPTY_CHATS;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);
  const renameTargetChat = is.nonEmptyString(renameChatId)
    ? (chats.find((chat) => chat.id === renameChatId) ?? null)
    : null;
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
      ? {
          chatId: selectedChatId,
          root: workspaceToolRoot,
        }
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
    draftCreationLocations[draftCreationLocationKey] ?? "project";
  const runtimePageKey = workspaceRuntimePageKey({
    chatRuntime,
    draftProjectId: routeDraftProjectId,
    draftSessionId: is.nonEmptyString(draftRuntimeKey)
      ? draftSessionIds[draftRuntimeKey]
      : undefined,
    selectedChatId,
    settingsActive,
  });
  const draftRuntime = is.nonEmptyString(draftRuntimeKey)
    ? resolveEnabledAgentRuntime(
        agentSettings,
        draftRuntimes[draftRuntimeKey],
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
      enabled:
        isDraftPage &&
        workspaceMode === "work" &&
        draftProject.id !== undefined,
      projectId: draftProject.id,
    }),
  });
  const canCreateDraftWorktree =
    isDraftPage &&
    workspaceMode === "work" &&
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
      enabled: shouldPrewarmChat && draftCreationLocation !== "worktree",
      projectId: draftProject.id,
      runtime: activeRuntime,
    }),
  });
  const shouldInspectDraftRuntimeConfig =
    isDraftPage &&
    draftCreationLocation === "worktree" &&
    draftProject.path !== undefined;
  const draftRuntimeConfigQuery = useQuery({
    ...chatRuntimeConfigQueryOptions({
      api,
      cwd: draftProject.path,
      enabled: shouldInspectDraftRuntimeConfig,
      runtime: activeRuntime,
    }),
  });
  const runtimeConfig =
    draftCreationLocation === "worktree"
      ? draftRuntimeConfigQuery.data
      : prewarmQuery.data?.config;
  const runtimeConfigLoading =
    draftCreationLocation === "worktree"
      ? draftRuntimeConfigQuery.isFetching
      : prewarmQuery.isFetching;
  const {
    chatOptions,
    draftAgentConfig,
    modeOverride,
    modelOverride,
    permissionModeOverride,
    reasoningEffortOverride,
    setAgentModel,
    setAgentReasoningEffort,
  } = useDraftChatOptions({
    activeRuntime,
    agentSettings,
    configLoading: runtimeConfigLoading,
    draftAgentConfigs,
    draftRuntimeKey,
    runtimeConfig,
    runtimeOptions,
    runtimePageKey,
    setDraftAgentConfigs,
    setDraftRuntimes,
  });
  const selectedChatAgentConfig =
    draftAgentConfigFromExplicitOverrides({
      mode: modeOverride,
      model: modelOverride,
      permissionMode: permissionModeOverride,
      reasoningEffort: reasoningEffortOverride,
    }) ?? draftAgentConfig;

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

    return groupedChats;
  }, [chats]);
  const setChatInCache = useCallback(
    (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => {
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        upsertChatInList(current, chat),
      );

      queryClient.setQueryData<ChatLoadResult | undefined>(
        queryKeys.chats.detail(chat.id),
        (current) => {
          if (messages) {
            return { chat, config: config ?? current?.config, messages };
          }
          if (current) {
            return { ...current, chat, config: config ?? current.config };
          }
          return {
            chat,
            config,
            messages: [],
          };
        },
      );
    },
    [queryClient],
  );
  const setChatMessagesInCache = useCallback(
    (
      chatId: string,
      messages: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => {
      queryClient.setQueryData<ChatLoadResult | undefined>(
        queryKeys.chats.detail(chatId),
        (current) =>
          current
            ? { ...current, config: config ?? current.config, messages }
            : current,
      );
    },
    [queryClient],
  );

  const navigateToChat = useCallback(
    (chat: Chat, options?: { replace?: boolean }) => {
      const path = chatRoutePath(chat);
      if (location !== path) {
        navigate(path, options);
      }
    },
    [location, navigate],
  );

  const updateChatFromRun = useCallback(
    (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
      origin?: ChatRunOrigin,
    ) => {
      const runRuntime =
        origin?.runtime ??
        (isAgentRuntime(chat.runtime) ? chat.runtime : undefined);
      const runConfig =
        origin?.config ??
        draftAgentConfigFromExplicitOverrides({
          mode: modeOverride,
          model: modelOverride,
          permissionMode: permissionModeOverride,
          reasoningEffort: reasoningEffortOverride,
        });

      if (origin?.isDraft === true && is.nonEmptyString(runRuntime)) {
        setDraftAgentConfigs((current) =>
          carryDraftAgentConfigToChat(current, {
            config: runConfig,
            runtime: runRuntime,
            targetChatId: chat.id,
          }),
        );
      }

      if (messages !== undefined && is.nonEmptyString(runRuntime)) {
        const preference = agentRuntimePreferenceFromExplicitOverrides(
          runConfig ?? {},
        );
        updateAgentSettings((current) =>
          rememberAgentRuntimePreference(current, runRuntime, preference),
        );
        if (origin?.isDraft) {
          setDraftAgentConfigs((current) =>
            clearDraftAgentConfig(current, origin.runtimePageKey, runRuntime),
          );
        }
      }

      setChatInCache(chat, messages, config);
      if (
        origin?.isDraft &&
        origin.runtimePageKey === runtimePageKey &&
        currentHashRoutePath() === currentRoutePath
      ) {
        navigateToChat(chat);
      }
    },
    [
      currentRoutePath,
      navigateToChat,
      modeOverride,
      modelOverride,
      setChatInCache,
      setDraftAgentConfigs,
      permissionModeOverride,
      reasoningEffortOverride,
      runtimePageKey,
      updateAgentSettings,
    ],
  );

  const createProjectMutation = useMutation({
    ...createProjectMutationOptions({ api, queryClient }),
  });
  const { mutateAsync: setChatRuntime } = useMutation({
    ...setChatRuntimeMutationOptions({ api, queryClient }),
  });
  const deleteAllChatsMutation = useMutation({
    ...deleteAllChatsMutationOptions({ api, queryClient }),
  });
  const archiveChatMutation = useMutation({
    ...archiveChatMutationOptions({ api, queryClient }),
  });
  const showProjectContextMenuMutation = useMutation({
    ...projectContextMenuMutationOptions({ api, queryClient }),
  });
  const showChatContextMenuMutation = useMutation({
    ...chatContextMenuMutationOptions({ api, queryClient }),
  });
  const renameChatMutation = useMutation({
    ...renameChatMutationOptions({ api, queryClient }),
  });

  const applyAllChatsDeleted = useCallback(() => {
    cancelAllChatRuns();
    queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), EMPTY_CHATS);
    queryClient.removeQueries({ queryKey: queryKeys.chats.details() });
    navigate("/", { replace: true });
  }, [navigate, queryClient]);

  useEffect(
    () =>
      subscribeToChatMetadataEvents((event) => {
        if (event.type === "delete-all") {
          applyAllChatsDeleted();
        } else {
          void invalidateChatQueries(queryClient);
        }
      }),
    [applyAllChatsDeleted, queryClient],
  );

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await api.projects.chooseDirectory();
      if (!is.nonEmptyString(selectedPath)) return undefined;

      return await createProjectMutation.mutateAsync(selectedPath);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("notifications.couldNotAddProject"),
        variant: "destructive",
      });
      return undefined;
    }
  }, [api, createProjectMutation, t, toast]);

  const showProjectContextMenu = useCallback(
    async (project: Project) => {
      try {
        const action =
          await showProjectContextMenuMutation.mutateAsync(project);

        if (
          action === "deleted" &&
          (routeProjectId ?? routeDraftProjectId) === project.id
        ) {
          navigate("/", { replace: true });
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.projectActionFailed"),
          variant: "destructive",
        });
      }
    },
    [
      navigate,
      routeDraftProjectId,
      routeProjectId,
      showProjectContextMenuMutation,
      t,
      toast,
    ],
  );

  const removeChatFromCache = useCallback(
    (chatId: string) => {
      cancelChatRun(chatId);
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        current.filter((chat) => chat.id !== chatId),
      );
      queryClient.removeQueries({ queryKey: queryKeys.chats.detail(chatId) });

      if (selectedChatId === chatId) {
        navigate("/", { replace: true });
      }
    },
    [navigate, queryClient, selectedChatId],
  );

  const openRenameChatDialog = useCallback((chat: Chat) => {
    setRenameChatId(chat.id);
  }, []);

  const showChatContextMenu = useCallback(
    async (chat: Chat) => {
      try {
        const action = await showChatContextMenuMutation.mutateAsync(chat);
        if (action === "rename") {
          openRenameChatDialog(chat);
        } else if (action === "deleted") {
          removeChatFromCache(chat.id);
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.chatActionFailed"),
          variant: "destructive",
        });
      }
    },
    [
      openRenameChatDialog,
      removeChatFromCache,
      showChatContextMenuMutation,
      t,
      toast,
    ],
  );

  const closeRenameChatDialog = useCallback(() => {
    setRenameChatId(null);
  }, []);

  const renameChat = useCallback(
    async (chat: Chat, title: string) => {
      try {
        await renameChatMutation.mutateAsync({
          chatId: chat.id,
          title,
        });
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.couldNotRenameChat"),
          variant: "destructive",
        });
        throw error;
      }
    },
    [renameChatMutation, t, toast],
  );

  const setPersistedChatRuntime = useCallback(
    async (chatId: string, runtime: AgentRuntime) => {
      try {
        const chat = await setChatRuntime({ chatId, runtime });
        cancelChatRun(chat.id);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.couldNotChangeAgent"),
          variant: "destructive",
        });
      }
    },
    [setChatRuntime, t, toast],
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
    (projectId?: string) => {
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
      navigateToDraft(projectId);
    },
    [
      activeRuntime,
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

  const archiveChat = useCallback(
    async (chat: Chat) => {
      try {
        const archivedChat = await archiveChatMutation.mutateAsync(chat);
        broadcastChatsChanged();

        if (selectedChatId === archivedChat.id) {
          navigateToDraft(archivedChat.projectId ?? undefined, {
            replace: true,
          });
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.chatActionFailed"),
          variant: "destructive",
        });
      }
    },
    [archiveChatMutation, navigateToDraft, selectedChatId, t, toast],
  );

  const createChatForProject = useCallback(
    (project: Project) => {
      startNewDraftSession(project.id);
    },
    [startNewDraftSession],
  );

  const createChatForSelection = useCallback(() => {
    startNewDraftSession();
  }, [startNewDraftSession]);

  const selectDraftProject = useCallback(
    (projectId: string | null) => {
      navigateToDraft(projectId ?? undefined);
    },
    [navigateToDraft],
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

  const openSettings = useCallback(() => {
    window.desktopWindow.openSettings();
  }, []);

  const openChat = useCallback(
    (chat: Chat) => {
      navigateToChat(chat);
    },
    [navigateToChat],
  );

  const deleteAllChats = useCallback(async () => {
    try {
      const result = await deleteAllChatsMutation.mutateAsync();
      applyAllChatsDeleted();
      broadcastAllChatsDeleted();
      toast({
        description: t("notifications.chatsDeletedDescription", {
          count: result.deletedCount,
        }),
        title: t("notifications.chatsDeleted"),
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("notifications.couldNotDeleteChats"),
        variant: "destructive",
      });
    }
  }, [applyAllChatsDeleted, deleteAllChatsMutation, t, toast]);

  if (selectedChat) {
    const canonicalPath = chatRoutePath(selectedChat);
    if (canonicalPath !== currentRoutePath) {
      return <Redirect replace to={canonicalPath} />;
    }
  }

  if (
    selectedChatId !== undefined &&
    chatsQuery.isSuccess &&
    !selectedChat &&
    !selectedChatIsRunning
  ) {
    return <Redirect replace to="/" />;
  }

  return (
    <SidebarProvider
      onOpenChange={setSidebarOpen}
      onOpenMobileChange={setSidebarOpenMobile}
      open={sidebarOpen}
      openMobile={sidebarOpenMobile}
    >
      <WorkspaceSidebarControlPortalProvider>
        <WorkspaceSidebar
          chats={chats}
          isChatsLoading={chatsQuery.isPending}
          isMacOS={isMacOS}
          isProjectsLoading={projectsQuery.isPending}
          onArchiveChat={archiveChat}
          onCreateProject={() => void createProjectFromPicker()}
          onCreateProjectChat={createChatForProject}
          onCreateStandaloneChat={createChatForSelection}
          onOpenChat={openChat}
          onOpenSettings={openSettings}
          onShowChatContextMenu={showChatContextMenu}
          onShowProjectContextMenu={showProjectContextMenu}
          projectChatsByProjectId={projectChatsByProjectId}
          projects={projects}
          selectedChatId={selectedChatId}
          selectedProjectId={selectedProjectId}
          settingsActive={settingsActive}
        />
        <WorkspaceFloatingSidebar
          chats={chats}
          isChatsLoading={chatsQuery.isPending}
          isMacOS={isMacOS}
          isProjectsLoading={projectsQuery.isPending}
          onArchiveChat={archiveChat}
          onCreateProject={() => void createProjectFromPicker()}
          onCreateProjectChat={createChatForProject}
          onCreateStandaloneChat={createChatForSelection}
          onOpenChat={openChat}
          onOpenSettings={openSettings}
          onShowChatContextMenu={showChatContextMenu}
          onShowProjectContextMenu={showProjectContextMenu}
          projectChatsByProjectId={projectChatsByProjectId}
          projects={projects}
          selectedChatId={selectedChatId}
          selectedProjectId={selectedProjectId}
          settingsActive={settingsActive}
        />
        <WorkspaceSidebarControl />
        <WorkspaceNativeCommandHandler
          onCreateStandaloneChat={createChatForSelection}
          onOpenSettings={openSettings}
        />
        <RenameChatDialog
          chat={renameTargetChat}
          isSaving={renameChatMutation.isPending}
          onClose={closeRenameChatDialog}
          onRename={renameChat}
        />
        <WorktreeDirtyDialog
          checked={rememberWorktreeDirtyChoice}
          onCheckedChange={setRememberWorktreeDirtyChoice}
          onClose={closeWorktreeDirtyPrompt}
          state={worktreeDirtyPrompt}
        />
        <WorkspaceToolContextBridge
          chatId={selectedChatId ?? null}
          root={workspaceToolRoot ?? null}
        />

        {settingsActive ? (
          <SidebarInset className="h-svh max-h-svh overflow-hidden">
            <WorkspaceHeader attention={chatAttention} title={workspaceTitle} />
            <SettingsPage
              agentSettings={agentSettings}
              availableAgentOptions={availableAgentOptions}
              isDeletingChats={deleteAllChatsMutation.isPending}
              onAgentEnabledChange={setAgentEnabled}
              onAgentOrderChange={(orderedRuntimes) =>
                updateAgentSettings((current) =>
                  rememberAgentOrder(current, orderedRuntimes),
                )
              }
              onDeleteAllChats={deleteAllChats}
            />
          </SidebarInset>
        ) : (
          <SidebarInset className="h-svh max-h-svh overflow-hidden">
            <WorkspaceHeader
              attention={chatAttention}
              rightSidebarOpen={
                canShowRightSidebar &&
                (rightSidebarOpen || workspaceToolHost !== "sidebar")
              }
              rightSidebarToggleLabel={workspaceToolsToggleLabel}
              title={workspaceTitle}
              workspaceToolActions={
                canShowRightSidebar && workspaceToolHost === "sidebar" ? (
                  <WorkspaceToolSurfaceHostControls
                    host="sidebar"
                    onRequestHost={requestWorkspaceToolHost}
                  />
                ) : undefined
              }
              onToggleRightSidebar={
                canShowRightSidebar ? toggleWorkspaceTools : undefined
              }
            />
            <main className="flex min-h-0 flex-1 overflow-hidden">
              <section
                className="flex min-h-0 min-w-0 flex-1 flex-col"
                data-workspace-mode={workspaceMode}
              >
                {is.nonEmptyString(selectedChatId) ? (
                  selectedChatIsRunning && selectedChat ? (
                    <ActiveChatThread
                      draftAgentConfig={selectedChatAgentConfig}
                      onChatCreated={updateChatFromRun}
                      onChatMessagesUpdated={setChatMessagesInCache}
                      onChatUpdated={updateChatFromRun}
                      projects={projects}
                      routeProjectId={routeProjectId}
                      runtimeOptions={runtimeOptions}
                      selectedChat={selectedChat}
                      setAgentModel={setAgentModel}
                      setAgentReasoningEffort={setAgentReasoningEffort}
                      setPersistedChatRuntime={setPersistedChatRuntime}
                    />
                  ) : (
                    <ChatRestoreErrorBoundary key={selectedChatId}>
                      <Suspense fallback={<ChatRestoreLoading />}>
                        <RestoredChatThread
                          api={api}
                          currentRoutePath={currentRoutePath}
                          draftAgentConfig={selectedChatAgentConfig}
                          onChatCreated={updateChatFromRun}
                          onChatMessagesUpdated={setChatMessagesInCache}
                          onChatUpdated={updateChatFromRun}
                          projects={projects}
                          routeProjectId={routeProjectId}
                          runtimeOptions={runtimeOptions}
                          selectedChatId={selectedChatId}
                          setAgentModel={setAgentModel}
                          setAgentReasoningEffort={setAgentReasoningEffort}
                          setPersistedChatRuntime={setPersistedChatRuntime}
                        />
                      </Suspense>
                    </ChatRestoreErrorBoundary>
                  )
                ) : (
                  <NewChatThread
                    chatOptions={chatOptions}
                    creationLocation={draftCreationLocation}
                    creationLocationAccessory={
                      canCreateDraftWorktree ? (
                        <DraftCreationLocationSelect
                          onValueChange={setDraftCreationLocation}
                          value={draftCreationLocation}
                          variant="ghost"
                        />
                      ) : undefined
                    }
                    key={runtimePageKey}
                    model={modelOverride}
                    mode={modeOverride}
                    onBeforeSubmit={ensureDraftChatCanSubmit}
                    onChatCreated={updateChatFromRun}
                    onChatMessagesUpdated={setChatMessagesInCache}
                    onChatUpdated={updateChatFromRun}
                    onCreateProject={createProjectFromPicker}
                    onProjectChange={selectDraftProject}
                    permissionMode={permissionModeOverride}
                    prewarmId={
                      draftCreationLocation === "worktree"
                        ? undefined
                        : prewarmQuery.data?.prewarmId
                    }
                    projectId={draftProject.id}
                    projectName={selectedProjectName}
                    projects={projects}
                    reasoningEffort={reasoningEffortOverride}
                    runOrigin={{
                      config: draftAgentConfigFromExplicitOverrides({
                        mode: modeOverride,
                        model: modelOverride,
                        permissionMode: permissionModeOverride,
                        reasoningEffort: reasoningEffortOverride,
                      }),
                      isDraft: true,
                      runtime: activeRuntime,
                      runtimePageKey,
                    }}
                    runtime={activeRuntime}
                    runtimeConfig={runtimeConfig}
                    slotKey={runtimePageKey}
                  />
                )}
              </section>
              {dockedWorkspaceToolContext ? (
                <WorkspaceRightSidebar
                  active={workspaceToolHost === "sidebar"}
                  api={api}
                  chatId={dockedWorkspaceToolContext.chatId}
                  open={rightSidebarOpen}
                  root={dockedWorkspaceToolContext.root}
                  width={rightSidebarWidth}
                  onWidthChange={setRightSidebarWidth}
                />
              ) : null}
            </main>
          </SidebarInset>
        )}
      </WorkspaceSidebarControlPortalProvider>
    </SidebarProvider>
  );
}

function WorktreeDirtyDialog({
  checked,
  onCheckedChange,
  onClose,
  state,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onClose: (confirmed: boolean) => void;
  state: WorktreeDirtyPromptState | null;
}) {
  const { t } = useTranslation();
  const projectPath = state?.status.path;

  return (
    <Dialog
      open={!is.falsy(state)}
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("workspace.worktreeDirtyTitle")}</DialogTitle>
          <DialogDescription>
            {t("workspace.worktreeDirtyDescription")}
          </DialogDescription>
        </DialogHeader>
        {is.nonEmptyString(projectPath) ? (
          <div
            className="
              min-w-0 rounded-md border bg-muted/35 px-3 py-2 text-xs
              text-muted-foreground
            "
            title={projectPath}
          >
            <span className="block truncate">{projectPath}</span>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            checked={checked}
            className="size-4 accent-primary"
            onChange={(event) => onCheckedChange(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>{t("workspace.worktreeDirtyRemember")}</span>
        </label>
        <DialogFooter>
          <Button
            onClick={() => onClose(false)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onClose(true)} type="button">
            {t("workspace.worktreeDirtyContinue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkspaceNativeCommandHandler({
  onCreateStandaloneChat,
  onOpenSettings,
}: {
  onCreateStandaloneChat: () => void;
  onOpenSettings: () => void;
}) {
  const { toggleSidebar } = useSidebar();

  useEffect(
    () =>
      window.desktopWindow.onCommand((command) => {
        switch (command) {
          case "new-chat":
            onCreateStandaloneChat();
            break;
          case "open-settings":
            onOpenSettings();
            break;
          case "toggle-sidebar":
            toggleSidebar();
            break;
        }
      }),
    [onCreateStandaloneChat, onOpenSettings, toggleSidebar],
  );

  return null;
}

function upsertChatInList(chats: Chat[], chat: Chat) {
  const next = chats.filter((item) => item.id !== chat.id);
  next.unshift(chat);
  return next.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function agentRuntimePreferenceFromExplicitOverrides(
  overrides: AgentRuntimePreference,
): AgentRuntimePreference | undefined {
  const preference = sanitizeAgentRuntimePreference(overrides);

  return Object.keys(preference).length > 0 ? preference : undefined;
}

function carryDraftAgentConfigToChat(
  configs: Partial<Record<string, DraftAgentConfig>>,
  {
    config,
    runtime,
    targetChatId,
  }: {
    config?: DraftAgentConfig;
    runtime: AgentRuntime;
    targetChatId: string;
  },
): Partial<Record<string, DraftAgentConfig>> {
  if (config === undefined || Object.keys(config).length === 0) return configs;

  const targetKey = draftAgentConfigKey(
    workspaceRuntimePageKey({
      chatRuntime: runtime,
      selectedChatId: targetChatId,
      settingsActive: false,
    }),
    runtime,
  );
  if (configs[targetKey] === config) return configs;

  return {
    ...configs,
    [targetKey]: config,
  };
}

function draftAgentConfigFromExplicitOverrides(
  overrides: DraftAgentConfig,
): DraftAgentConfig | undefined {
  const config: DraftAgentConfig = {};
  if (overrides.model !== undefined) config.model = overrides.model;
  if (overrides.mode !== undefined) config.mode = overrides.mode;
  if (overrides.permissionMode !== undefined) {
    config.permissionMode = overrides.permissionMode;
  }
  if (overrides.reasoningEffort !== undefined) {
    config.reasoningEffort = overrides.reasoningEffort;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

function optionalString(value: string | null | undefined) {
  return value ?? undefined;
}

function clearDraftAgentConfig(
  configs: Partial<Record<string, DraftAgentConfig>>,
  runtimePageKey: string,
  runtime: AgentRuntime,
): Partial<Record<string, DraftAgentConfig>> {
  const keyToClear = draftAgentConfigKey(runtimePageKey, runtime);
  if (configs[keyToClear] === undefined) return configs;

  const next = { ...configs };
  delete next[keyToClear];

  return next;
}
