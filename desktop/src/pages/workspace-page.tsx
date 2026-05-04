import { useCallback, useMemo, useState } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { Redirect, useLocation } from 'wouter';

import { AppRuntimeProvider } from '@/app/app-runtime-provider';
import { WorkspaceHeader } from '@/app/workspace-header';
import { WorkspaceSidebar } from '@/app/workspace-sidebar';
import { ChatOptionsProvider } from '@/chat/chat-options-context';
import { AssistantThread } from '@/chat/assistant-thread';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useAgentSettings } from '@/hooks/use-agent-settings';
import { useToast } from '@/components/ui/toast';
import { useApi } from '@/hooks/use-api';
import { SettingsPage } from '@/pages/settings-page';
import {
  chatContextMenuMutationOptions,
  chatListQueryOptions,
  chatLoadQueryOptions,
  chatRuntimeConfigQueryOptions,
  createProjectChatMutationOptions,
  deleteAllChatsMutationOptions,
} from '@/requests/chats';
import { queryKeys } from '@/requests/keys';
import {
  createProjectMutationOptions,
  projectContextMenuMutationOptions,
  projectListQueryOptions,
} from '@/requests/projects';
import {
  getAgentModes,
  getAgentReasoningEfforts,
  normalizeAgentConfigValue,
  normalizeAgentModel,
  normalizeAgentRuntime,
  type AgentValueOption,
  type AgentRuntime,
} from '@/shared/agents';
import type {
  Chat,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatRuntimeConfig,
  ChatRuntimeConfigOption,
} from '@/shared/chat';
import type { Project } from '@/shared/projects';

export type WorkspaceRoute =
  | { type: 'create' }
  | { chatId: string; type: 'chat' }
  | { chatId: string; projectId: string; type: 'projectChat' }
  | { type: 'settings' };

const EMPTY_CHATS: Chat[] = [];
const EMPTY_MESSAGES: ChatHistoryMessage[] = [];
const EMPTY_PROJECTS: Project[] = [];

export function WorkspacePage({ route }: { route: WorkspaceRoute }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();
  const isMacOS = window.desktopEnvironment.platform === 'darwin';
  const [agentSettings, updateAgentSettings] = useAgentSettings();
  const [draftRuntime, setDraftRuntime] = useState<AgentRuntime>(
    agentSettings.defaultRuntime
  );

  const selectedChatId =
    route.type === 'chat' || route.type === 'projectChat'
      ? route.chatId
      : undefined;
  const currentRoutePath = routePath(route);

  const projectsQuery = useQuery({
    ...projectListQueryOptions({ api }),
  });
  const chatsQuery = useQuery({
    ...chatListQueryOptions({ api }),
  });
  const chatLoadQuery = useQuery({
    ...chatLoadQueryOptions({ api, chatId: selectedChatId }),
  });

  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const chats = chatsQuery.data ?? EMPTY_CHATS;
  const selectedChat =
    chatLoadQuery.data?.chat ??
    chats.find((chat) => chat.id === selectedChatId);
  const selectedProjectId =
    route.type === 'projectChat'
      ? route.projectId
      : selectedChat?.projectId ?? undefined;
  const historyMessages = selectedChatId
    ? chatLoadQuery.data?.messages ?? EMPTY_MESSAGES
    : EMPTY_MESSAGES;
  const historyRevision = selectedChatId
    ? chatLoadQuery.dataUpdatedAt
    : 0;
  const chatRuntime = selectedChat
    ? normalizeAgentRuntime(selectedChat.runtime)
    : undefined;
  const activeRuntime = chatRuntime ?? draftRuntime;
  const runtimePageKey = selectedChatId
    ? `chat:${selectedChatId}:${chatRuntime ?? 'pending'}`
    : `create:${draftRuntime}`;
  const shouldInspectRuntimeConfig = route.type === 'create';
  const runtimeConfigQuery = useQuery({
    ...chatRuntimeConfigQueryOptions({
      api,
      cwd: selectedChat?.cwd ?? undefined,
      enabled: shouldInspectRuntimeConfig,
      runtime: activeRuntime,
    }),
  });
  const runtimeConfig = chatLoadQuery.data?.config ?? runtimeConfigQuery.data;
  const modelOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(runtimeConfig?.models, [
      { label: 'Default', value: 'default' },
    ]),
    agentSettings.models[activeRuntime]
  );
  const reasoningEffortOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.reasoningEfforts,
      getAgentReasoningEfforts(activeRuntime)
    ),
    agentSettings.reasoningEfforts[activeRuntime]
  );
  const modeOptions = ensureConfigOption(
    runtimeConfigOptionsToAgentOptions(
      runtimeConfig?.modes,
      getAgentModes(activeRuntime)
    ),
    agentSettings.modes[activeRuntime]
  );
  const activeModel = normalizeAgentModel(agentSettings.models[activeRuntime]);
  const activeReasoningEffort = normalizeAgentConfigValue(
    agentSettings.reasoningEfforts[activeRuntime]
  );
  const activeMode = normalizeAgentConfigValue(agentSettings.modes[activeRuntime]);

  const projectIds = useMemo(
    () => new Set(projects.map((project) => project.id)),
    [projects]
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
        (chat) => !chat.projectId || !projectIds.has(chat.projectId)
      ),
    [chats, projectIds]
  );
  const setDefaultRuntime = useCallback(
    (runtime: AgentRuntime) => {
      setDraftRuntime(runtime);
      updateAgentSettings((current) => ({
        ...current,
        defaultRuntime: runtime,
      }));
    },
    [updateAgentSettings]
  );
  const setAgentModel = useCallback(
    (runtime: AgentRuntime, model: string) => {
      updateAgentSettings((current) => ({
        ...current,
        models: {
          ...current.models,
          [runtime]: normalizeAgentModel(model),
        },
      }));
    },
    [updateAgentSettings]
  );
  const setAgentReasoningEffort = useCallback(
    (runtime: AgentRuntime, effort: string) => {
      updateAgentSettings((current) => ({
        ...current,
        reasoningEfforts: {
          ...current.reasoningEfforts,
          [runtime]: normalizeAgentConfigValue(effort),
        },
      }));
    },
    [updateAgentSettings]
  );
  const setAgentMode = useCallback(
    (runtime: AgentRuntime, mode: string) => {
      updateAgentSettings((current) => ({
        ...current,
        modes: {
          ...current.modes,
          [runtime]: normalizeAgentConfigValue(mode),
        },
      }));
    },
    [updateAgentSettings]
  );
  const chatOptions = useMemo(
    () => ({
      configLoading: runtimeConfigQuery.isFetching,
      model: activeModel,
      modelOptions,
      mode: activeMode,
      modeOptions,
      reasoningEffort: activeReasoningEffort,
      reasoningEffortOptions,
      runtime: activeRuntime,
      runtimeLocked: Boolean(chatRuntime),
      setModel: (model: string) => setAgentModel(activeRuntime, model),
      setMode: (mode: string) => setAgentMode(activeRuntime, mode),
      setReasoningEffort: (effort: string) =>
        setAgentReasoningEffort(activeRuntime, effort),
      setRuntime: setDefaultRuntime,
    }),
    [
      activeMode,
      activeModel,
      activeReasoningEffort,
      activeRuntime,
      chatRuntime,
      modelOptions,
      modeOptions,
      reasoningEffortOptions,
      runtimeConfigQuery.isFetching,
      setAgentModel,
      setAgentMode,
      setAgentReasoningEffort,
      setDefaultRuntime,
    ]
  );

  const setChatInCache = useCallback(
    (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig
    ) => {
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        upsertChatInList(current, chat)
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
        }
      );
    },
    [queryClient]
  );

  const navigateToChat = useCallback(
    (chat: Chat, options?: { replace?: boolean }) => {
      const path = chatRoutePath(chat);
      if (location !== path) {
        navigate(path, options);
      }
    },
    [location, navigate]
  );

  const upsertChat = useCallback(
    (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig
    ) => {
      setChatInCache(chat, messages, config);
      navigateToChat(chat);
    },
    [navigateToChat, setChatInCache]
  );

  const createProjectMutation = useMutation({
    ...createProjectMutationOptions({ api, queryClient }),
  });
  const createProjectChatMutation = useMutation({
    ...createProjectChatMutationOptions({
      api,
      queryClient,
      runtime: draftRuntime,
    }),
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
        title: 'Could not load projects',
        variant: 'destructive',
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
        title: 'Could not add project',
        variant: 'destructive',
      });
    }
  }, [api, createProjectMutation, toast]);

  const showProjectContextMenu = useCallback(
    async (project: Project) => {
      try {
        await showProjectContextMenuMutation.mutateAsync(project);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Project action failed',
          variant: 'destructive',
        });
      }
    },
    [showProjectContextMenuMutation, toast]
  );

  const removeChatFromCache = useCallback(
    (chatId: string) => {
      queryClient.setQueryData<Chat[]>(
        queryKeys.chats.list(),
        (current = []) => current.filter((chat) => chat.id !== chatId)
      );
      queryClient.removeQueries({ queryKey: queryKeys.chats.detail(chatId) });

      if (selectedChatId === chatId) {
        navigate('/', { replace: true });
      }
    },
    [navigate, queryClient, selectedChatId]
  );

  const showChatContextMenu = useCallback(
    async (chat: Chat) => {
      try {
        const action = await showChatContextMenuMutation.mutateAsync(chat);
        if (action === 'deleted') {
          removeChatFromCache(chat.id);
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Chat action failed',
          variant: 'destructive',
        });
      }
    },
    [removeChatFromCache, showChatContextMenuMutation, toast]
  );

  const createChatForProject = useCallback(
    async (project: Project) => {
      try {
        const chat = await createProjectChatMutation.mutateAsync(project);
        setChatInCache(chat, EMPTY_MESSAGES);
        navigateToChat(chat);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Could not create chat',
          variant: 'destructive',
        });
      }
    },
    [createProjectChatMutation, navigateToChat, setChatInCache, toast]
  );

  const createChatForSelection = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const openSettings = useCallback(() => {
    navigate('/settings');
  }, [navigate]);

  const openChat = useCallback(
    (chat: Chat) => {
      navigateToChat(chat);
    },
    [navigateToChat]
  );

  const deleteAllChats = useCallback(async () => {
    try {
      const result = await deleteAllChatsMutation.mutateAsync();
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), EMPTY_CHATS);
      queryClient.removeQueries({ queryKey: queryKeys.chats.details() });
      navigate('/', { replace: true });
      toast({
        description: `Deleted ${result.deletedCount} chat${
          result.deletedCount === 1 ? '' : 's'
        }.`,
        title: 'Chats deleted',
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not delete chats',
        variant: 'destructive',
      });
    }
  }, [deleteAllChatsMutation, navigate, queryClient, toast]);

  if (selectedChatId && chatLoadQuery.isError) {
    return <Redirect replace to="/" />;
  }

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
        settingsActive={route.type === 'settings'}
        standaloneChats={standaloneChats}
      />

      {route.type === 'settings' ? (
        <SidebarInset className="h-svh max-h-svh overflow-hidden md:h-[calc(100svh-1rem)] md:max-h-[calc(100svh-1rem)]">
          <WorkspaceHeader />
          <SettingsPage
            agentSettings={agentSettings}
            isDeletingChats={deleteAllChatsMutation.isPending}
            onAgentModeChange={setAgentMode}
            onAgentReasoningEffortChange={setAgentReasoningEffort}
            onDeleteAllChats={deleteAllChats}
            onDefaultAgentChange={setDefaultRuntime}
          />
        </SidebarInset>
      ) : (
        <ChatOptionsProvider value={chatOptions}>
          <AppRuntimeProvider
            chatId={selectedChatId}
            historyMessages={historyMessages}
            historyRevision={historyRevision}
            key={runtimePageKey}
            model={activeModel}
            mode={activeMode}
            onChatUpdated={upsertChat}
            projectId={selectedChat?.projectId ?? null}
            projectPath={selectedChat?.cwd ?? undefined}
            reasoningEffort={activeReasoningEffort}
            runtime={activeRuntime}
          >
            <SidebarInset className="h-svh max-h-svh overflow-hidden md:h-[calc(100svh-1rem)] md:max-h-[calc(100svh-1rem)]">
              <WorkspaceHeader />
              <main className="flex min-h-0 flex-1 overflow-hidden">
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <AssistantThread />
                </section>
              </main>
            </SidebarInset>
          </AppRuntimeProvider>
        </ChatOptionsProvider>
      )}
    </SidebarProvider>
  );
}

function upsertChatInList(chats: Chat[], chat: Chat) {
  const next = chats.filter((item) => item.id !== chat.id);
  next.unshift(chat);
  return next.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt)
  );
}

function runtimeConfigOptionsToAgentOptions(
  options: ChatRuntimeConfigOption[] | undefined,
  fallback: AgentValueOption[]
): AgentValueOption[] {
  if (!options?.length) return fallback;
  return options.map((option) => ({
    description: option.description ?? undefined,
    label: option.label,
    value: option.value,
  }));
}

function ensureConfigOption(
  options: AgentValueOption[],
  value: string | null | undefined
) {
  const normalizedValue = value?.trim() || 'default';
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

function labelFromConfigValue(value: string) {
  if (value === 'xhigh') return 'XHigh';
  if (value === 'default') return 'Default';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
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

function routePath(route: WorkspaceRoute) {
  if (route.type === 'projectChat') {
    return `/project/${encodeURIComponent(route.projectId)}/${encodeURIComponent(route.chatId)}`;
  }
  if (route.type === 'chat') {
    return `/chat/${encodeURIComponent(route.chatId)}`;
  }
  if (route.type === 'settings') {
    return '/settings';
  }
  return '/';
}
