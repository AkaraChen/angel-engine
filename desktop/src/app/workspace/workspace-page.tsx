import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { useTranslation } from "react-i18next";

import { AppRuntimeProvider } from "@/features/chat/runtime/app-runtime-provider";
import { ChatRestoreLoading } from "@/app/workspace/chat-restore-loading";
import { WorkspaceHeader } from "@/app/workspace/workspace-header";
import {
  WorkspaceSidebarControl,
  WorkspaceSidebarControlPortalProvider,
} from "@/app/workspace/workspace-sidebar-control";
import { WorkspaceSidebar } from "@/app/workspace/workspace-sidebar";
import { ChatOptionsProvider } from "@/features/chat/runtime/chat-options-context";
import { AssistantThread } from "@/features/chat/components/assistant-thread";
import { RenameChatDialog } from "@/features/chat/components/rename-chat-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAgentSettings } from "@/features/settings/use-agent-settings";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/platform/use-api";
import {
  cancelAllChatRuns,
  cancelChatRun,
  setActiveChatRunId,
  useChatAttentionSummary,
  useChatRunConfig,
  useChatRunIsRunning,
  useChatRunMessages,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";
import { SettingsPage } from "@/features/settings/settings-page";
import {
  archiveChatMutationOptions,
  chatContextMenuMutationOptions,
  createChatMutationOptions,
  chatListQueryOptions,
  chatLoadSuspenseQueryOptions,
  chatPrewarmQueryOptions,
  chatRuntimeConfigQueryOptions,
  deleteAllChatsMutationOptions,
  renameChatMutationOptions,
  setChatRuntimeMutationOptions,
} from "@/features/chat/api/queries";
import { queryKeys } from "@/platform/query-keys";
import {
  createProjectMutationOptions,
  projectContextMenuMutationOptions,
  projectListQueryOptions,
} from "@/features/projects/api/queries";
import {
  getEnabledAgentOptions,
  resolveEnabledAgentRuntime,
  type AgentValueOption,
  type AgentRuntime,
} from "@/shared/agents";
import type {
  Chat,
  ChatCreateInput,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigOption,
} from "@/shared/chat";
import type { DesktopOpenChatFromNotificationEvent } from "@/shared/desktop-window";
import type { Project } from "@/shared/projects";

export type WorkspaceRoute =
  | { type: "create" }
  | { chatId: string; type: "chat" }
  | { projectId: string; type: "projectCreate" }
  | { chatId: string; projectId: string; type: "projectChat" }
  | { type: "settings" };

const EMPTY_CHATS: Chat[] = [];
const EMPTY_MESSAGES: ChatHistoryMessage[] = [];
const EMPTY_PROJECTS: Project[] = [];
const NO_CONFIG_OVERRIDE_VALUE = "__angel_no_override__";

type DraftAgentConfig = {
  model?: string;
  mode?: string;
  permissionMode?: string;
  reasoningEffort?: string;
};

type ChatUpdateHandler = (
  chat: Chat,
  messages?: ChatHistoryMessage[],
  config?: ChatRuntimeConfig,
) => void;

type ActiveChatThreadProps = {
  draftAgentConfig: DraftAgentConfig;
  onChatCreated: (chat: Chat) => void;
  onChatUpdated: ChatUpdateHandler;
  projects: Project[];
  route: WorkspaceRoute;
  runtimeOptions: Array<{
    label: string;
    value: AgentRuntime;
  }>;
  selectedChat: Chat;
  setAgentModel: (model: string) => void;
  setAgentReasoningEffort: (effort: string) => void;
  setPersistedChatRuntime: (
    chatId: string,
    runtime: AgentRuntime,
  ) => Promise<void> | void;
};

type RestoredChatThreadProps = Omit<ActiveChatThreadProps, "selectedChat"> & {
  api: ReturnType<typeof useApi>;
  currentRoutePath: string;
  selectedChatId: string;
};

type ChatThreadRuntimeProps = ActiveChatThreadProps & {
  configLoading: boolean;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  keySuffix?: string;
  runtimeConfig?: ChatRuntimeConfig;
  slotKey: string;
};

type ChatProjectContext = {
  id?: string;
  name?: string;
  path?: string;
  project?: Project;
};

const EMPTY_DRAFT_AGENT_CONFIG: DraftAgentConfig = {};

export function WorkspacePage({ route }: { route: WorkspaceRoute }) {
  const api = useApi();
  const selectedChatId = selectedChatIdFromRoute(route);

  return (
    <WorkspacePageContent
      api={api}
      route={route}
      selectedChatId={selectedChatId}
    />
  );
}

function WorkspacePageContent({
  api,
  route,
  selectedChatId,
}: {
  api: ReturnType<typeof useApi>;
  route: WorkspaceRoute;
  selectedChatId?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const isMacOS = window.desktopEnvironment.platform === "darwin";
  const [agentSettings, updateAgentSettings] = useAgentSettings();
  const enabledAgentOptions = useMemo(
    () => getEnabledAgentOptions(agentSettings),
    [agentSettings],
  );
  const runtimeOptions = useMemo(
    () =>
      enabledAgentOptions.map((agent) => ({
        label: agent.label,
        value: agent.id,
      })),
    [enabledAgentOptions],
  );
  const [draftRuntimes, setDraftRuntimes] = useState<
    Partial<Record<string, AgentRuntime>>
  >({});
  const [draftAgentConfigs, setDraftAgentConfigs] = useState<
    Partial<Record<string, DraftAgentConfig>>
  >({});
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const createChatPendingRef = useRef(false);

  const currentRoutePath = routePath(route);

  const projectsQuery = useQuery({
    ...projectListQueryOptions({ api }),
  });
  const chatsQuery = useQuery({
    ...chatListQueryOptions({ api }),
  });
  const selectedChatIsRunning = useChatRunIsRunning(selectedChatId);

  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const chats = chatsQuery.data ?? EMPTY_CHATS;
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);
  const renameTargetChat = renameChatId
    ? (chats.find((chat) => chat.id === renameChatId) ?? null)
    : null;
  const chatAttention = useChatAttentionSummary();
  const routeProjectId =
    route.type === "projectChat" || route.type === "projectCreate"
      ? route.projectId
      : undefined;
  const selectedProjectId =
    routeProjectId ?? selectedChat?.projectId ?? undefined;
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const selectedProjectPath = selectedProject?.path ?? selectedChat?.cwd;
  const selectedProjectName = selectedProjectPath
    ? getProjectDisplayName(selectedProjectPath)
    : undefined;
  const workspaceTitle = getWorkspaceTitle({
    route,
    selectedChat,
    selectedProjectName,
    t,
  });
  const historyMessages = EMPTY_MESSAGES;
  const historyRevision = 0;
  const chatRuntime = selectedChat?.runtime as AgentRuntime | undefined;
  const runtimePageKey = runtimePageKeyFromRoute({
    chatRuntime,
    route,
    selectedChatId,
  });
  const draftRuntimeKey = draftRuntimeKeyFromRoute(route);
  const draftRuntime = draftRuntimeKey
    ? resolveEnabledAgentRuntime(agentSettings, draftRuntimes[draftRuntimeKey])
    : agentSettings.defaultRuntime;
  const activeRuntime = chatRuntime ?? draftRuntime;
  const draftAgentConfigKey = `${runtimePageKey}:${activeRuntime}`;
  const draftAgentConfig =
    draftAgentConfigs[draftAgentConfigKey] ?? EMPTY_DRAFT_AGENT_CONFIG;
  const shouldPrewarmRoute =
    route.type === "create" || route.type === "projectCreate";
  const shouldPrewarmChat =
    shouldPrewarmRoute &&
    (route.type !== "projectCreate" || Boolean(selectedProjectPath));
  const prewarmQuery = useQuery({
    ...chatPrewarmQueryOptions({
      api,
      enabled: shouldPrewarmChat,
      projectId: route.type === "projectCreate" ? route.projectId : undefined,
      runtime: activeRuntime,
    }),
  });
  const runtimeConfig = prewarmQuery.data?.config;
  const activeModel = normalizeConfigDisplayValue(
    draftAgentConfig.model ?? runtimeConfig?.currentModel,
  );
  const activeReasoningEffort = normalizeConfigDisplayValue(
    draftAgentConfig.reasoningEffort ?? runtimeConfig?.currentReasoningEffort,
  );
  const activeMode = normalizeConfigDisplayValue(
    draftAgentConfig.mode ?? runtimeConfig?.currentMode,
  );
  const activePermissionMode = normalizeConfigDisplayValue(
    draftAgentConfig.permissionMode ?? runtimeConfig?.currentPermissionMode,
  );
  const modelOverride = selectedConfigOverride(draftAgentConfig.model);
  const reasoningEffortOverride = selectedConfigOverride(
    draftAgentConfig.reasoningEffort,
  );
  const modeOverride = selectedConfigOverride(draftAgentConfig.mode);
  const permissionModeOverride = selectedConfigOverride(
    draftAgentConfig.permissionMode,
  );
  const modelOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.models,
      t("common.useDefault"),
    ),
    activeModel,
    t("common.useDefault"),
    t("common.default"),
  );
  const reasoningEffortOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.reasoningEfforts,
      t("common.useDefault"),
    ),
    activeReasoningEffort,
    t("common.useDefault"),
    t("common.default"),
  );
  const modeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.modes,
      t("common.useDefault"),
    ),
    activeMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const permissionModeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.permissionModes,
      t("common.useDefault"),
    ),
    activePermissionMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const modelOptionCount = runtimeConfigOptionCount(runtimeConfig?.models);
  const reasoningEffortOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.reasoningEfforts,
  );
  const modeOptionCount = runtimeConfigOptionCount(runtimeConfig?.modes);
  const permissionModeOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.permissionModes,
  );
  const canSetModel = runtimeConfig?.canSetModel ?? true;
  const canSetMode = runtimeConfig?.canSetMode ?? true;
  const canSetPermissionMode = runtimeConfig?.canSetPermissionMode ?? true;
  const canSetReasoningEffort = runtimeConfig?.canSetReasoningEffort ?? true;

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

  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects],
  );
  const projectChatsByProjectId = useMemo(() => {
    const groupedChats = new Map<string, Chat[]>();

    for (const chat of chats) {
      if (!chat.projectId) continue;

      const projectChats = groupedChats.get(chat.projectId) ?? [];
      projectChats.push(chat);
      groupedChats.set(chat.projectId, projectChats);
    }

    return groupedChats;
  }, [chats]);
  const standaloneChats = useMemo(
    () =>
      chats.filter(
        (chat) => !chat.projectId || !projectIds.has(chat.projectId),
      ),
    [chats, projectIds],
  );
  const setDraftAgentRuntime = useCallback(
    (runtime: AgentRuntime) => {
      if (!draftRuntimeKey) return;
      if (!agentSettings.enabledRuntimes.includes(runtime)) return;
      setDraftRuntimes((current) => ({
        ...current,
        [draftRuntimeKey]: runtime,
      }));
    },
    [agentSettings.enabledRuntimes, draftRuntimeKey],
  );
  const setDefaultRuntime = useCallback(
    (runtime: AgentRuntime) => {
      if (!agentSettings.enabledRuntimes.includes(runtime)) return;
      updateAgentSettings((current) => ({
        ...current,
        defaultRuntime: runtime,
      }));
    },
    [agentSettings.enabledRuntimes, updateAgentSettings],
  );
  const setAgentEnabled = useCallback(
    (runtime: AgentRuntime, enabled: boolean) => {
      updateAgentSettings((current) => {
        const enabledRuntimes = new Set(current.enabledRuntimes);
        if (enabled) {
          enabledRuntimes.add(runtime);
        } else {
          enabledRuntimes.delete(runtime);
        }
        return {
          ...current,
          enabledRuntimes: [...enabledRuntimes],
        };
      });
    },
    [updateAgentSettings],
  );
  const setDraftAgentConfigValue = useCallback(
    (field: keyof DraftAgentConfig, value: string) => {
      setDraftAgentConfigs((current) => ({
        ...current,
        [draftAgentConfigKey]: {
          ...current[draftAgentConfigKey],
          [field]: normalizeConfigDisplayValue(value),
        },
      }));
    },
    [draftAgentConfigKey],
  );
  const setAgentModel = useCallback(
    (model: string) => {
      setDraftAgentConfigValue("model", model);
    },
    [setDraftAgentConfigValue],
  );
  const setAgentReasoningEffort = useCallback(
    (effort: string) => {
      setDraftAgentConfigValue("reasoningEffort", effort);
    },
    [setDraftAgentConfigValue],
  );
  const setAgentMode = useCallback(
    (mode: string) => {
      setDraftAgentConfigValue("mode", mode);
    },
    [setDraftAgentConfigValue],
  );
  const setAgentPermissionMode = useCallback(
    (mode: string) => {
      setDraftAgentConfigValue("permissionMode", mode);
    },
    [setDraftAgentConfigValue],
  );
  const chatOptions = useMemo(
    () => ({
      canSetModel,
      canSetMode,
      canSetPermissionMode,
      canSetReasoningEffort,
      canSetRuntime: true,
      configLoading: prewarmQuery.isFetching,
      model: activeModel,
      modelOptionCount,
      modelOptions,
      mode: activeMode,
      modeOptionCount,
      modeOptions,
      permissionMode: activePermissionMode,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffort: activeReasoningEffort,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtime: activeRuntime,
      runtimeOptions,
      setModel: setAgentModel,
      setMode: setAgentMode,
      setPermissionMode: setAgentPermissionMode,
      setReasoningEffort: setAgentReasoningEffort,
      setRuntime: setDraftAgentRuntime,
    }),
    [
      activeMode,
      activeModel,
      activePermissionMode,
      activeReasoningEffort,
      activeRuntime,
      canSetModel,
      canSetMode,
      canSetPermissionMode,
      canSetReasoningEffort,
      modelOptionCount,
      modelOptions,
      modeOptionCount,
      modeOptions,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtimeOptions,
      prewarmQuery.isFetching,
      setAgentModel,
      setAgentMode,
      setAgentPermissionMode,
      setAgentReasoningEffort,
      setDraftAgentRuntime,
    ],
  );

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
          return current;
        },
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
    ) => {
      setChatInCache(chat, messages, config);
      if (
        (route.type === "create" || route.type === "projectCreate") &&
        currentHashRoutePath() === currentRoutePath
      ) {
        navigateToChat(chat);
      }
    },
    [currentRoutePath, navigateToChat, route.type, setChatInCache],
  );

  const createProjectMutation = useMutation({
    ...createProjectMutationOptions({ api, queryClient }),
  });
  const { isPending: isCreatingChat, mutateAsync: createChat } = useMutation({
    ...createChatMutationOptions({ api, queryClient }),
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

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await api.projects.chooseDirectory();
      if (!selectedPath) return;

      await createProjectMutation.mutateAsync(selectedPath);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("notifications.couldNotAddProject"),
        variant: "destructive",
      });
    }
  }, [api, createProjectMutation, t, toast]);

  const showProjectContextMenu = useCallback(
    async (project: Project) => {
      try {
        const action =
          await showProjectContextMenuMutation.mutateAsync(project);

        if (action === "deleted" && routeProjectId === project.id) {
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
    [navigate, routeProjectId, showProjectContextMenuMutation, t, toast],
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

  const archiveChat = useCallback(
    async (chat: Chat) => {
      try {
        await archiveChatMutation.mutateAsync(chat);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.chatActionFailed"),
          variant: "destructive",
        });
      }
    },
    [archiveChatMutation, t, toast],
  );

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

  const chatRunSlots = useChatRunStore((state) => state.slots);
  const runningChatIds = useMemo(
    () => runningChatIdsFromSlots(chatRunSlots),
    [chatRunSlots],
  );

  const createAndOpenChat = useCallback(
    async (input: ChatCreateInput) => {
      if (createChatPendingRef.current || isCreatingChat) return;

      createChatPendingRef.current = true;
      try {
        const chat = await createChat(input);
        navigateToChat(chat);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.couldNotCreateChat"),
          variant: "destructive",
        });
      } finally {
        createChatPendingRef.current = false;
      }
    },
    [createChat, isCreatingChat, navigateToChat, t, toast],
  );

  const createChatForProject = useCallback(
    (project: Project) => {
      const reusableChat = reusableUnstartedChat({
        chats: projectChatsByProjectId.get(project.id) ?? EMPTY_CHATS,
        preferredChat: selectedChat,
        runningChatIds,
      });

      if (reusableChat) {
        navigateToChat(reusableChat);
        return;
      }

      void createAndOpenChat({
        projectId: project.id,
        runtime: resolveEnabledAgentRuntime(
          agentSettings,
          draftRuntimes[`project:${project.id}`],
        ),
      });
    },
    [
      agentSettings,
      createAndOpenChat,
      draftRuntimes,
      navigateToChat,
      projectChatsByProjectId,
      runningChatIds,
      selectedChat,
    ],
  );

  const createChatForSelection = useCallback(() => {
    const reusableChat = reusableUnstartedChat({
      chats: standaloneChats,
      preferredChat: selectedChat,
      runningChatIds,
    });

    if (reusableChat) {
      navigateToChat(reusableChat);
      return;
    }

    void createAndOpenChat({
      runtime: resolveEnabledAgentRuntime(agentSettings, draftRuntimes.create),
    });
  }, [
    agentSettings,
    createAndOpenChat,
    draftRuntimes.create,
    navigateToChat,
    runningChatIds,
    selectedChat,
    standaloneChats,
  ]);

  const openSettings = useCallback(() => {
    navigate("/settings");
  }, [navigate]);

  const openChat = useCallback(
    (chat: Chat) => {
      navigateToChat(chat);
    },
    [navigateToChat],
  );

  const deleteAllChats = useCallback(async () => {
    try {
      const result = await deleteAllChatsMutation.mutateAsync();
      cancelAllChatRuns();
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), EMPTY_CHATS);
      queryClient.removeQueries({ queryKey: queryKeys.chats.details() });
      navigate("/", { replace: true });
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
  }, [deleteAllChatsMutation, navigate, queryClient, t, toast]);

  if (selectedChat) {
    const canonicalPath = chatRoutePath(selectedChat);
    if (canonicalPath !== currentRoutePath) {
      return <Redirect replace to={canonicalPath} />;
    }
  }

  return (
    <SidebarProvider>
      <WorkspaceSidebarControlPortalProvider>
        <WorkspaceSidebar
          chats={chats}
          isChatsLoading={chatsQuery.isPending}
          isMacOS={isMacOS}
          isProjectsLoading={projectsQuery.isPending}
          onArchiveChat={archiveChat}
          onCreateProject={createProjectFromPicker}
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
          settingsActive={route.type === "settings"}
          standaloneChats={standaloneChats}
        />
        <WorkspaceSidebarControl />
        <RenameChatDialog
          chat={renameTargetChat}
          isSaving={renameChatMutation.isPending}
          onClose={closeRenameChatDialog}
          onRename={renameChat}
        />

        {route.type === "settings" ? (
          <SidebarInset className="h-svh max-h-svh overflow-hidden">
            <WorkspaceHeader attention={chatAttention} title={workspaceTitle} />
            <SettingsPage
              agentSettings={agentSettings}
              isDeletingChats={deleteAllChatsMutation.isPending}
              onAgentEnabledChange={setAgentEnabled}
              onDeleteAllChats={deleteAllChats}
              onDefaultAgentChange={setDefaultRuntime}
            />
          </SidebarInset>
        ) : (
          <SidebarInset className="h-svh max-h-svh overflow-hidden">
            <WorkspaceHeader attention={chatAttention} title={workspaceTitle} />
            <main className="flex min-h-0 flex-1 overflow-hidden">
              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                {selectedChatId ? (
                  selectedChatIsRunning && selectedChat ? (
                    <ActiveChatThread
                      draftAgentConfig={draftAgentConfig}
                      onChatCreated={updateChatFromRun}
                      onChatUpdated={updateChatFromRun}
                      projects={projects}
                      route={route}
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
                          draftAgentConfig={draftAgentConfig}
                          onChatCreated={updateChatFromRun}
                          onChatUpdated={updateChatFromRun}
                          projects={projects}
                          route={route}
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
                  <ChatOptionsProvider value={chatOptions}>
                    <AppRuntimeProvider
                      chatId={selectedChatId}
                      historyMessages={historyMessages}
                      historyRevision={historyRevision}
                      key={runtimePageKey}
                      model={modelOverride}
                      mode={modeOverride}
                      onChatCreated={updateChatFromRun}
                      onChatUpdated={updateChatFromRun}
                      prewarmId={prewarmQuery.data?.prewarmId}
                      projectId={selectedProjectId ?? null}
                      projectPath={selectedProjectPath ?? undefined}
                      permissionMode={permissionModeOverride}
                      reasoningEffort={reasoningEffortOverride}
                      runtime={activeRuntime}
                      runtimeConfig={runtimeConfig}
                      slotKey={runtimePageKey}
                    >
                      <AssistantThread projectName={selectedProjectName} />
                    </AppRuntimeProvider>
                  </ChatOptionsProvider>
                )}
              </section>
            </main>
          </SidebarInset>
        )}
      </WorkspaceSidebarControlPortalProvider>
    </SidebarProvider>
  );
}

function selectedChatIdFromRoute(route: WorkspaceRoute) {
  return route.type === "chat" || route.type === "projectChat"
    ? route.chatId
    : undefined;
}

function runningChatIdsFromSlots(
  slots: Record<string, { chatId?: string; key: string; status: string }>,
) {
  const ids = new Set<string>();

  for (const slot of Object.values(slots)) {
    if (slot.status !== "streaming") continue;
    ids.add(slot.key);
    if (slot.chatId) {
      ids.add(slot.chatId);
    }
  }

  return ids;
}

function reusableUnstartedChat({
  chats,
  preferredChat,
  runningChatIds,
}: {
  chats: Chat[];
  preferredChat?: Chat;
  runningChatIds: ReadonlySet<string>;
}) {
  if (
    preferredChat &&
    chats.some((chat) => chat.id === preferredChat.id) &&
    isUnstartedChat(preferredChat, runningChatIds)
  ) {
    return preferredChat;
  }

  return chats.find((chat) => isUnstartedChat(chat, runningChatIds));
}

function isUnstartedChat(chat: Chat, runningChatIds: ReadonlySet<string>) {
  return !chat.remoteThreadId && !runningChatIds.has(chat.id);
}

function ActiveChatThread({
  draftAgentConfig,
  onChatCreated,
  onChatUpdated,
  projects,
  route,
  runtimeOptions,
  selectedChat,
  setAgentModel,
  setAgentReasoningEffort,
  setPersistedChatRuntime,
}: ActiveChatThreadProps) {
  const runtimeConfig = useChatRunConfig(selectedChat.id);

  return (
    <ChatThreadRuntime
      configLoading={false}
      draftAgentConfig={draftAgentConfig}
      historyMessages={EMPTY_MESSAGES}
      historyRevision={0}
      keySuffix="active"
      onChatCreated={onChatCreated}
      onChatUpdated={onChatUpdated}
      projects={projects}
      route={route}
      runtimeOptions={runtimeOptions}
      runtimeConfig={runtimeConfig}
      selectedChat={selectedChat}
      setAgentModel={setAgentModel}
      setAgentReasoningEffort={setAgentReasoningEffort}
      setPersistedChatRuntime={setPersistedChatRuntime}
      slotKey={selectedChat.id}
    />
  );
}

function RestoredChatThread({
  api,
  currentRoutePath,
  draftAgentConfig,
  onChatCreated,
  onChatUpdated,
  projects,
  route,
  runtimeOptions,
  selectedChatId,
  setAgentModel,
  setAgentReasoningEffort,
  setPersistedChatRuntime,
}: RestoredChatThreadProps) {
  const chatLoadQuery = useSuspenseQuery(
    chatLoadSuspenseQueryOptions({ api, chatId: selectedChatId }),
  );
  const chatLoadData = chatLoadQuery.data;
  const selectedChat = chatLoadData.chat;
  const liveRuntimeConfig = useChatRunConfig(selectedChatId);
  const inspectConfigQuery = useQuery({
    ...chatRuntimeConfigQueryOptions({
      api,
      cwd: selectedChat.cwd ?? undefined,
      enabled: !chatLoadData.config,
      runtime: selectedChat.runtime,
    }),
  });
  const runtimeConfig =
    liveRuntimeConfig ?? chatLoadData.config ?? inspectConfigQuery.data;
  const canonicalPath = chatRoutePath(selectedChat);

  if (canonicalPath !== currentRoutePath) {
    return <Redirect replace to={canonicalPath} />;
  }

  return (
    <ChatThreadRuntime
      configLoading={chatLoadQuery.isFetching || inspectConfigQuery.isFetching}
      draftAgentConfig={draftAgentConfig}
      historyMessages={chatLoadData.messages}
      historyRevision={chatLoadQuery.dataUpdatedAt}
      onChatCreated={onChatCreated}
      onChatUpdated={onChatUpdated}
      projects={projects}
      route={route}
      runtimeOptions={runtimeOptions}
      runtimeConfig={runtimeConfig}
      selectedChat={selectedChat}
      setAgentModel={setAgentModel}
      setAgentReasoningEffort={setAgentReasoningEffort}
      setPersistedChatRuntime={setPersistedChatRuntime}
      slotKey={selectedChatId}
    />
  );
}

function ChatThreadRuntime({
  configLoading,
  draftAgentConfig,
  historyMessages,
  historyRevision,
  keySuffix,
  onChatCreated,
  onChatUpdated,
  projects,
  route,
  runtimeOptions,
  runtimeConfig,
  selectedChat,
  setAgentModel,
  setAgentReasoningEffort,
  setPersistedChatRuntime,
  slotKey,
}: ChatThreadRuntimeProps) {
  const { t } = useTranslation();
  const setRunMode = useChatRunStore((state) => state.setMode);
  const setRunPermissionMode = useChatRunStore(
    (state) => state.setPermissionMode,
  );
  const isRunning = useChatRunIsRunning(slotKey);
  const liveMessages = useChatRunMessages(slotKey);
  const chatRuntime = selectedChat.runtime as AgentRuntime;
  const hasStarted =
    Boolean(selectedChat.remoteThreadId) ||
    historyMessages.length > 0 ||
    liveMessages.length > 0;
  const canSetRuntime = !hasStarted && !isRunning;
  const runtimeDisabledReason = isRunning
    ? t("composer.disabledReasons.agentCannotChangeWhileRunning")
    : hasStarted
      ? t("composer.disabledReasons.agentCannotChangeAfterStart")
      : undefined;
  const projectContext = chatProjectContext(route, selectedChat, projects);
  const activeModel = normalizeConfigDisplayValue(
    draftAgentConfig.model ?? runtimeConfig?.currentModel,
  );
  const activeReasoningEffort = normalizeConfigDisplayValue(
    draftAgentConfig.reasoningEffort ?? runtimeConfig?.currentReasoningEffort,
  );
  const activeMode = normalizeConfigDisplayValue(
    runtimeConfig?.agentState?.currentMode ??
      runtimeConfig?.currentMode ??
      draftAgentConfig.mode,
  );
  const activePermissionMode = normalizeConfigDisplayValue(
    runtimeConfig?.agentState?.currentPermissionMode ??
      runtimeConfig?.currentPermissionMode ??
      draftAgentConfig.permissionMode,
  );
  const modelOverride = selectedConfigOverride(draftAgentConfig.model);
  const reasoningEffortOverride = selectedConfigOverride(
    draftAgentConfig.reasoningEffort,
  );
  const setBackendMode = useCallback(
    async (mode: string) => {
      const modeOverride = selectedConfigOverride(mode);
      if (!modeOverride) return;
      await setRunMode(slotKey, modeOverride);
    },
    [setRunMode, slotKey],
  );
  const setBackendPermissionMode = useCallback(
    async (mode: string) => {
      const modeOverride = selectedConfigOverride(mode);
      if (!modeOverride) return;
      await setRunPermissionMode(slotKey, modeOverride);
    },
    [setRunPermissionMode, slotKey],
  );
  const setRuntime = useCallback(
    async (runtime: AgentRuntime) => {
      if (!canSetRuntime) return;
      await setPersistedChatRuntime(selectedChat.id, runtime);
    },
    [canSetRuntime, selectedChat.id, setPersistedChatRuntime],
  );
  const modelOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.models,
      t("common.useDefault"),
    ),
    activeModel,
    t("common.useDefault"),
    t("common.default"),
  );
  const reasoningEffortOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.reasoningEfforts,
      t("common.useDefault"),
    ),
    activeReasoningEffort,
    t("common.useDefault"),
    t("common.default"),
  );
  const modeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.modes,
      t("common.useDefault"),
    ),
    activeMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const permissionModeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.permissionModes,
      t("common.useDefault"),
    ),
    activePermissionMode,
    t("common.useDefault"),
    t("common.default"),
  );
  const modelOptionCount = runtimeConfigOptionCount(runtimeConfig?.models);
  const reasoningEffortOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.reasoningEfforts,
  );
  const modeOptionCount = runtimeConfigOptionCount(runtimeConfig?.modes);
  const permissionModeOptionCount = runtimeConfigOptionCount(
    runtimeConfig?.permissionModes,
  );
  const chatOptions = useMemo(
    () => ({
      canSetModel: runtimeConfig?.canSetModel ?? true,
      canSetMode: runtimeConfig?.canSetMode ?? true,
      canSetPermissionMode: runtimeConfig?.canSetPermissionMode ?? true,
      canSetReasoningEffort: runtimeConfig?.canSetReasoningEffort ?? true,
      canSetRuntime,
      configLoading,
      model: activeModel,
      modelOptionCount,
      modelOptions,
      mode: activeMode,
      modeOptionCount,
      modeOptions,
      permissionMode: activePermissionMode,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffort: activeReasoningEffort,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtime: chatRuntime,
      runtimeDisabledReason,
      runtimeOptions,
      setModel: setAgentModel,
      setMode: setBackendMode,
      setPermissionMode: setBackendPermissionMode,
      setReasoningEffort: setAgentReasoningEffort,
      setRuntime,
    }),
    [
      activeMode,
      activeModel,
      activePermissionMode,
      activeReasoningEffort,
      chatRuntime,
      configLoading,
      modelOptionCount,
      modelOptions,
      modeOptionCount,
      modeOptions,
      permissionModeOptionCount,
      permissionModeOptions,
      reasoningEffortOptionCount,
      reasoningEffortOptions,
      runtimeOptions,
      runtimeConfig?.canSetPermissionMode,
      runtimeConfig?.canSetMode,
      runtimeConfig?.canSetModel,
      runtimeConfig?.canSetReasoningEffort,
      canSetRuntime,
      runtimeDisabledReason,
      setAgentModel,
      setBackendPermissionMode,
      setAgentReasoningEffort,
      setBackendMode,
      setRuntime,
    ],
  );

  return (
    <ChatOptionsProvider value={chatOptions}>
      <AppRuntimeProvider
        chatId={selectedChat.id}
        historyMessages={historyMessages}
        historyRevision={historyRevision}
        key={chatRuntimeProviderKey(selectedChat.id, chatRuntime, keySuffix)}
        model={modelOverride}
        mode={undefined}
        onChatCreated={onChatCreated}
        onChatUpdated={onChatUpdated}
        projectId={projectContext.id ?? selectedChat.projectId ?? null}
        projectPath={projectContext.path ?? undefined}
        permissionMode={undefined}
        reasoningEffort={reasoningEffortOverride}
        runtime={chatRuntime}
        runtimeConfig={runtimeConfig}
        slotKey={slotKey}
      >
        <AssistantThread projectName={projectContext.name} />
      </AppRuntimeProvider>
    </ChatOptionsProvider>
  );
}

class ChatRestoreErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Chat restore failed", error, errorInfo);
  }

  render() {
    if (this.state.failed) {
      return <Redirect replace to="/" />;
    }

    return this.props.children;
  }
}

function upsertChatInList(chats: Chat[], chat: Chat) {
  const next = chats.filter((item) => item.id !== chat.id);
  next.unshift(chat);
  return next.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function runtimeConfigOptionsToAgentOptions(
  options: ChatRuntimeConfigOption[] | undefined,
  defaultLabel: string,
): AgentValueOption[] {
  const defaultOption: AgentValueOption = {
    label: defaultLabel,
    value: NO_CONFIG_OVERRIDE_VALUE,
  };
  if (!options?.length) return [defaultOption];
  const runtimeOptions = options.flatMap((option) => {
    const value = selectedConfigOverride(option.value);
    if (!value) return [];
    return [
      {
        description: option.description ?? undefined,
        label: option.label,
        value,
      },
    ];
  });
  return [defaultOption, ...runtimeOptions];
}

function runtimeConfigOptionCount(
  options: ChatRuntimeConfigOption[] | undefined,
): number {
  return (
    options?.filter((option) => selectedConfigOverride(option.value)).length ??
    0
  );
}

function ensureConfigOption(
  options: AgentValueOption[],
  value: string | null | undefined,
  defaultLabel: string,
  configDefaultLabel: string,
) {
  const normalizedValue = normalizeConfigDisplayValue(value);
  if (options.some((option) => option.value === normalizedValue)) {
    return options;
  }
  return [
    ...options,
    {
      label:
        normalizedValue === NO_CONFIG_OVERRIDE_VALUE
          ? defaultLabel
          : labelFromConfigValue(normalizedValue, configDefaultLabel),
      value: normalizedValue,
    },
  ];
}

function normalizeConfigDisplayValue(value: string | null | undefined) {
  return value || NO_CONFIG_OVERRIDE_VALUE;
}

function selectedConfigOverride(value: string | null | undefined) {
  if (!value || value === NO_CONFIG_OVERRIDE_VALUE) {
    return undefined;
  }
  return value;
}

function labelFromConfigValue(value: string, defaultLabel: string) {
  if (value === "xhigh") return "XHigh";
  if (value === "default") return defaultLabel;
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function chatRoutePath(chat: Chat) {
  if (chat.projectId) {
    return `/project/${encodeURIComponent(chat.projectId)}/${encodeURIComponent(chat.id)}`;
  }
  return `/chat/${encodeURIComponent(chat.id)}`;
}

function chatNotificationRoutePath(
  event: DesktopOpenChatFromNotificationEvent,
) {
  if (event.projectId) {
    return `/project/${encodeURIComponent(event.projectId)}/${encodeURIComponent(event.chatId)}`;
  }
  return `/chat/${encodeURIComponent(event.chatId)}`;
}

function chatRuntimeProviderKey(
  chatId: string,
  runtime: AgentRuntime,
  suffix?: string,
): string {
  const key = `chat:${chatId}:${runtime}`;
  return suffix ? `${key}:${suffix}` : key;
}

function runtimePageKeyFromRoute({
  chatRuntime,
  route,
  selectedChatId,
}: {
  chatRuntime?: AgentRuntime;
  route: WorkspaceRoute;
  selectedChatId?: string;
}): string {
  if (selectedChatId) {
    return `chat:${selectedChatId}:${chatRuntime ?? "pending"}`;
  }

  if (route.type === "projectCreate") {
    return `project-create:${route.projectId}`;
  }

  if (route.type === "settings") {
    return "settings";
  }

  return "create";
}

function chatProjectContext(
  route: WorkspaceRoute,
  chat: Chat,
  projects: Project[],
): ChatProjectContext {
  const routeProjectId =
    route.type === "projectChat" || route.type === "projectCreate"
      ? route.projectId
      : undefined;
  const projectId = routeProjectId ?? chat.projectId ?? undefined;
  const project = projectId
    ? projects.find((item) => item.id === projectId)
    : undefined;
  const path =
    project?.path ?? (projectId ? (chat.cwd ?? undefined) : undefined);

  return {
    id: projectId,
    name: path ? getProjectDisplayName(path) : undefined,
    path,
    project,
  };
}

function routePath(route: WorkspaceRoute) {
  if (route.type === "projectChat") {
    return `/project/${encodeURIComponent(route.projectId)}/${encodeURIComponent(route.chatId)}`;
  }
  if (route.type === "projectCreate") {
    return `/project/${encodeURIComponent(route.projectId)}`;
  }
  if (route.type === "chat") {
    return `/chat/${encodeURIComponent(route.chatId)}`;
  }
  if (route.type === "settings") {
    return "/settings";
  }
  return "/";
}

function currentHashRoutePath() {
  const path = window.location.hash.replace(/^#/, "");
  return path || "/";
}

function getWorkspaceTitle({
  route,
  selectedChat,
  selectedProjectName,
  t,
}: {
  route: WorkspaceRoute;
  selectedChat?: Chat;
  selectedProjectName?: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (route.type === "settings") return t("workspace.settings");
  if (selectedChat) return displayChatTitle(selectedChat.title, t);
  if (route.type === "projectCreate" && selectedProjectName) {
    return t("workspace.newChatInProject", {
      projectName: selectedProjectName,
    });
  }
  return t("workspace.newChat");
}

function draftRuntimeKeyFromRoute(route: WorkspaceRoute) {
  if (route.type === "create") return "create";
  if (route.type === "projectCreate") return `project:${route.projectId}`;
  return undefined;
}

function getProjectDisplayName(projectPath: string) {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

function displayChatTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return title === "New chat" ? t("workspace.newChat") : title;
}
