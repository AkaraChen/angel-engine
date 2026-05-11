import {
  Component,
  Suspense,
  useCallback,
  useMemo,
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

import { AppRuntimeProvider } from "@/features/chat/runtime/app-runtime-provider";
import { ChatRestoreLoading } from "@/app/workspace/chat-restore-loading";
import { WorkspaceHeader } from "@/app/workspace/workspace-header";
import { WorkspaceSidebar } from "@/app/workspace/workspace-sidebar";
import { ChatOptionsProvider } from "@/features/chat/runtime/chat-options-context";
import { AssistantThread } from "@/features/chat/components/assistant-thread";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAgentSettings } from "@/features/settings/use-agent-settings";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/platform/use-api";
import {
  cancelAllChatRuns,
  cancelChatRun,
  useChatRunConfig,
  useChatRunIsRunning,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";
import { SettingsPage } from "@/features/settings/settings-page";
import {
  chatContextMenuMutationOptions,
  chatListQueryOptions,
  chatLoadSuspenseQueryOptions,
  chatPrewarmQueryOptions,
  deleteAllChatsMutationOptions,
} from "@/features/chat/api/queries";
import { queryKeys } from "@/platform/query-keys";
import {
  createProjectMutationOptions,
  projectContextMenuMutationOptions,
  projectListQueryOptions,
} from "@/features/projects/api/queries";
import { type AgentValueOption, type AgentRuntime } from "@/shared/agents";
import type {
  Chat,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigOption,
} from "@/shared/chat";
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
const NO_CONFIG_OVERRIDE_OPTION: AgentValueOption = {
  label: "Use default",
  value: NO_CONFIG_OVERRIDE_VALUE,
};
const NO_CONFIG_OVERRIDE_OPTIONS: AgentValueOption[] = [
  NO_CONFIG_OVERRIDE_OPTION,
];

type DraftAgentConfig = {
  model?: string;
  mode?: string;
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
  selectedChat: Chat;
  setAgentModel: (model: string) => void;
  setAgentReasoningEffort: (effort: string) => void;
  setDraftAgentRuntime: (runtime: AgentRuntime) => void;
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const isMacOS = window.desktopEnvironment.platform === "darwin";
  const [agentSettings, updateAgentSettings] = useAgentSettings();
  const [draftRuntimes, setDraftRuntimes] = useState<
    Partial<Record<string, AgentRuntime>>
  >({});
  const [draftAgentConfigs, setDraftAgentConfigs] = useState<
    Partial<Record<string, DraftAgentConfig>>
  >({});

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
  });
  const historyMessages = EMPTY_MESSAGES;
  const historyRevision = 0;
  const chatRuntime = selectedChat?.runtime as AgentRuntime | undefined;
  const draftRuntimeKey = draftRuntimeKeyFromRoute(route);
  const draftRuntime = draftRuntimeKey
    ? (draftRuntimes[draftRuntimeKey] ?? agentSettings.defaultRuntime)
    : agentSettings.defaultRuntime;
  const activeRuntime = chatRuntime ?? draftRuntime;
  const runtimePageKey = runtimePageKeyFromRoute({
    chatRuntime,
    route,
    selectedChatId,
  });
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
  const modelOverride = selectedConfigOverride(draftAgentConfig.model);
  const reasoningEffortOverride = selectedConfigOverride(
    draftAgentConfig.reasoningEffort,
  );
  const modeOverride = selectedConfigOverride(draftAgentConfig.mode);
  const modelOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(runtimeConfig?.models),
    activeModel,
  );
  const reasoningEffortOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(runtimeConfig?.reasoningEfforts),
    activeReasoningEffort,
  );
  const modeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(runtimeConfig?.modes),
    activeMode,
  );
  const canSetModel = runtimeConfig?.canSetModel ?? true;
  const canSetMode = runtimeConfig?.canSetMode ?? true;
  const canSetReasoningEffort = runtimeConfig?.canSetReasoningEffort ?? true;

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
      setDraftRuntimes((current) => ({
        ...current,
        [draftRuntimeKey]: runtime,
      }));
    },
    [draftRuntimeKey],
  );
  const setDefaultRuntime = useCallback(
    (runtime: AgentRuntime) => {
      updateAgentSettings((current) => ({
        ...current,
        defaultRuntime: runtime,
      }));
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
  const chatOptions = useMemo(
    () => ({
      canSetModel,
      canSetMode,
      canSetReasoningEffort,
      configLoading: prewarmQuery.isFetching,
      model: activeModel,
      modelOptions,
      mode: activeMode,
      modeOptions,
      reasoningEffort: activeReasoningEffort,
      reasoningEffortOptions,
      runtime: activeRuntime,
      runtimeLocked: Boolean(chatRuntime),
      setModel: setAgentModel,
      setMode: setAgentMode,
      setReasoningEffort: setAgentReasoningEffort,
      setRuntime: setDraftAgentRuntime,
    }),
    [
      activeMode,
      activeModel,
      activeReasoningEffort,
      activeRuntime,
      canSetModel,
      canSetMode,
      canSetReasoningEffort,
      chatRuntime,
      modelOptions,
      modeOptions,
      reasoningEffortOptions,
      prewarmQuery.isFetching,
      setAgentModel,
      setAgentMode,
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
  const deleteAllChatsMutation = useMutation({
    ...deleteAllChatsMutationOptions({ api, queryClient }),
  });
  const showProjectContextMenuMutation = useMutation({
    ...projectContextMenuMutationOptions({ api, queryClient }),
  });
  const showChatContextMenuMutation = useMutation({
    ...chatContextMenuMutationOptions({ api, queryClient }),
  });

  const refreshProjects = useCallback(async () => {
    const result = await projectsQuery.refetch();
    if (result.error) {
      toast({
        description: getErrorMessage(result.error),
        title: "Could not load projects",
        variant: "destructive",
      });
    }
  }, [projectsQuery, toast]);

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await api.projects.chooseDirectory();
      if (!selectedPath) return;

      await createProjectMutation.mutateAsync(selectedPath);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: "Could not add project",
        variant: "destructive",
      });
    }
  }, [api, createProjectMutation, toast]);

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
          title: "Project action failed",
          variant: "destructive",
        });
      }
    },
    [navigate, routeProjectId, showProjectContextMenuMutation, toast],
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

  const showChatContextMenu = useCallback(
    async (chat: Chat) => {
      try {
        const action = await showChatContextMenuMutation.mutateAsync(chat);
        if (action === "deleted") {
          removeChatFromCache(chat.id);
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: "Chat action failed",
          variant: "destructive",
        });
      }
    },
    [removeChatFromCache, showChatContextMenuMutation, toast],
  );

  const createChatForProject = useCallback(
    (project: Project) => {
      navigate(`/project/${encodeURIComponent(project.id)}`);
    },
    [navigate],
  );

  const createChatForSelection = useCallback(() => {
    navigate("/");
  }, [navigate]);

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
        description: `Deleted ${result.deletedCount} chat${
          result.deletedCount === 1 ? "" : "s"
        }.`,
        title: "Chats deleted",
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: "Could not delete chats",
        variant: "destructive",
      });
    }
  }, [deleteAllChatsMutation, navigate, queryClient, toast]);

  if (selectedChat) {
    const canonicalPath = chatRoutePath(selectedChat);
    if (canonicalPath !== currentRoutePath) {
      return <Redirect replace to={canonicalPath} />;
    }
  }

  return (
    <SidebarProvider>
      <WorkspaceSidebar
        isChatsLoading={chatsQuery.isPending}
        isMacOS={isMacOS}
        isProjectsLoading={projectsQuery.isPending}
        onCreateProject={createProjectFromPicker}
        onCreateProjectChat={createChatForProject}
        onCreateStandaloneChat={createChatForSelection}
        onOpenChat={openChat}
        onOpenSettings={openSettings}
        onRefreshProjects={refreshProjects}
        onShowChatContextMenu={showChatContextMenu}
        onShowProjectContextMenu={showProjectContextMenu}
        projectChatsByProjectId={projectChatsByProjectId}
        projects={projects}
        selectedChatId={selectedChatId}
        selectedProjectId={selectedProjectId}
        settingsActive={route.type === "settings"}
        standaloneChats={standaloneChats}
      />

      {route.type === "settings" ? (
        <SidebarInset className="h-svh max-h-svh overflow-hidden md:h-[calc(100svh-1rem)] md:max-h-[calc(100svh-1rem)]">
          <WorkspaceHeader title={workspaceTitle} />
          <SettingsPage
            agentSettings={agentSettings}
            isDeletingChats={deleteAllChatsMutation.isPending}
            onDeleteAllChats={deleteAllChats}
            onDefaultAgentChange={setDefaultRuntime}
          />
        </SidebarInset>
      ) : (
        <SidebarInset className="h-svh max-h-svh overflow-hidden md:h-[calc(100svh-1rem)] md:max-h-[calc(100svh-1rem)]">
          <WorkspaceHeader title={workspaceTitle} />
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
                    selectedChat={selectedChat}
                    setAgentModel={setAgentModel}
                    setAgentReasoningEffort={setAgentReasoningEffort}
                    setDraftAgentRuntime={setDraftAgentRuntime}
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
                        selectedChatId={selectedChatId}
                        setAgentModel={setAgentModel}
                        setAgentReasoningEffort={setAgentReasoningEffort}
                        setDraftAgentRuntime={setDraftAgentRuntime}
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
    </SidebarProvider>
  );
}

function selectedChatIdFromRoute(route: WorkspaceRoute) {
  return route.type === "chat" || route.type === "projectChat"
    ? route.chatId
    : undefined;
}

function ActiveChatThread({
  draftAgentConfig,
  onChatCreated,
  onChatUpdated,
  projects,
  route,
  selectedChat,
  setAgentModel,
  setAgentReasoningEffort,
  setDraftAgentRuntime,
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
      runtimeConfig={runtimeConfig}
      selectedChat={selectedChat}
      setAgentModel={setAgentModel}
      setAgentReasoningEffort={setAgentReasoningEffort}
      setDraftAgentRuntime={setDraftAgentRuntime}
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
  selectedChatId,
  setAgentModel,
  setAgentReasoningEffort,
  setDraftAgentRuntime,
}: RestoredChatThreadProps) {
  const chatLoadQuery = useSuspenseQuery(
    chatLoadSuspenseQueryOptions({ api, chatId: selectedChatId }),
  );
  const chatLoadData = chatLoadQuery.data;
  const selectedChat = chatLoadData.chat;
  const liveRuntimeConfig = useChatRunConfig(selectedChatId);
  const runtimeConfig = liveRuntimeConfig ?? chatLoadData.config;
  const canonicalPath = chatRoutePath(selectedChat);

  if (canonicalPath !== currentRoutePath) {
    return <Redirect replace to={canonicalPath} />;
  }

  return (
    <ChatThreadRuntime
      configLoading={chatLoadQuery.isFetching}
      draftAgentConfig={draftAgentConfig}
      historyMessages={chatLoadData.messages}
      historyRevision={chatLoadQuery.dataUpdatedAt}
      onChatCreated={onChatCreated}
      onChatUpdated={onChatUpdated}
      projects={projects}
      route={route}
      runtimeConfig={runtimeConfig}
      selectedChat={selectedChat}
      setAgentModel={setAgentModel}
      setAgentReasoningEffort={setAgentReasoningEffort}
      setDraftAgentRuntime={setDraftAgentRuntime}
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
  runtimeConfig,
  selectedChat,
  setAgentModel,
  setAgentReasoningEffort,
  setDraftAgentRuntime,
  slotKey,
}: ChatThreadRuntimeProps) {
  const setRunMode = useChatRunStore((state) => state.setMode);
  const chatRuntime = selectedChat.runtime as AgentRuntime;
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
  const modelOverride = selectedConfigOverride(draftAgentConfig.model);
  const reasoningEffortOverride = selectedConfigOverride(
    draftAgentConfig.reasoningEffort,
  );
  const setBackendMode = useCallback(
    async (mode: string) => {
      await setRunMode(slotKey, mode);
    },
    [setRunMode, slotKey],
  );
  const modelOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(runtimeConfig?.models),
    activeModel,
  );
  const reasoningEffortOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(runtimeConfig?.reasoningEfforts),
    activeReasoningEffort,
  );
  const modeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(runtimeConfig?.modes),
    activeMode,
  );
  const chatOptions = useMemo(
    () => ({
      canSetModel: runtimeConfig?.canSetModel ?? true,
      canSetMode: runtimeConfig?.canSetMode ?? true,
      canSetReasoningEffort: runtimeConfig?.canSetReasoningEffort ?? true,
      configLoading,
      model: activeModel,
      modelOptions,
      mode: activeMode,
      modeOptions,
      reasoningEffort: activeReasoningEffort,
      reasoningEffortOptions,
      runtime: chatRuntime,
      runtimeLocked: true,
      setModel: setAgentModel,
      setMode: setBackendMode,
      setReasoningEffort: setAgentReasoningEffort,
      setRuntime: setDraftAgentRuntime,
    }),
    [
      activeMode,
      activeModel,
      activeReasoningEffort,
      chatRuntime,
      configLoading,
      modelOptions,
      modeOptions,
      reasoningEffortOptions,
      runtimeConfig?.canSetMode,
      runtimeConfig?.canSetModel,
      runtimeConfig?.canSetReasoningEffort,
      setAgentModel,
      setAgentReasoningEffort,
      setBackendMode,
      setDraftAgentRuntime,
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
): AgentValueOption[] {
  if (!options?.length) return NO_CONFIG_OVERRIDE_OPTIONS;
  const runtimeOptions = options.map((option) => ({
    description: option.description ?? undefined,
    label: option.label,
    value: option.value,
  }));
  return [NO_CONFIG_OVERRIDE_OPTION, ...runtimeOptions];
}

function ensureConfigOption(
  options: AgentValueOption[],
  value: string | null | undefined,
) {
  const normalizedValue = normalizeConfigDisplayValue(value);
  if (options.some((option) => option.value === normalizedValue)) {
    return options;
  }
  return [
    ...options,
    {
      label: labelFromConfigValue(normalizedValue),
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

function labelFromConfigValue(value: string) {
  if (value === "xhigh") return "XHigh";
  if (value === "default") return "Default";
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
  const path = project?.path ?? chat.cwd ?? undefined;

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
}: {
  route: WorkspaceRoute;
  selectedChat?: Chat;
  selectedProjectName?: string;
}) {
  if (route.type === "settings") return "Settings";
  if (selectedChat) return selectedChat.title;
  if (route.type === "projectCreate" && selectedProjectName) {
    return `New chat in ${selectedProjectName}`;
  }
  return "New chat";
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
