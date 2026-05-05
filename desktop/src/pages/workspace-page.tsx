import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";

import { AppRuntimeProvider } from "@/app/app-runtime-provider";
import { WorkspaceHeader } from "@/app/workspace-header";
import { WorkspaceSidebar } from "@/app/workspace-sidebar";
import { ChatOptionsProvider } from "@/chat/chat-options-context";
import { AssistantThread } from "@/chat/assistant-thread";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAgentSettings } from "@/hooks/use-agent-settings";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/hooks/use-api";
import { SettingsPage } from "@/pages/settings-page";
import {
  chatContextMenuMutationOptions,
  chatListQueryOptions,
  chatLoadQueryOptions,
  chatRuntimeConfigQueryOptions,
  deleteAllChatsMutationOptions,
} from "@/requests/chats";
import { queryKeys } from "@/requests/keys";
import {
  createProjectMutationOptions,
  projectContextMenuMutationOptions,
  projectListQueryOptions,
} from "@/requests/projects";
import {
  normalizeAgentRuntime,
  type AgentValueOption,
  type AgentRuntime,
} from "@/shared/agents";
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

const EMPTY_DRAFT_AGENT_CONFIG: DraftAgentConfig = {};

export function WorkspacePage({ route }: { route: WorkspaceRoute }) {
  const api = useApi();
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

  const selectedChatId =
    route.type === "chat" || route.type === "projectChat"
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
  const routeProjectId =
    route.type === "projectChat" || route.type === "projectCreate"
      ? route.projectId
      : undefined;
  const selectedProjectId =
    routeProjectId ?? selectedChat?.projectId ?? undefined;
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const selectedProjectPath = selectedChat?.cwd ?? selectedProject?.path;
  const selectedProjectName = selectedProjectPath
    ? getProjectDisplayName(selectedProjectPath)
    : undefined;
  const historyMessages = selectedChatId
    ? (chatLoadQuery.data?.messages ?? EMPTY_MESSAGES)
    : EMPTY_MESSAGES;
  const historyRevision = selectedChatId ? chatLoadQuery.dataUpdatedAt : 0;
  const chatRuntime = selectedChat
    ? normalizeAgentRuntime(selectedChat.runtime)
    : undefined;
  const draftRuntimeKey = draftRuntimeKeyFromRoute(route);
  const draftRuntime = draftRuntimeKey
    ? (draftRuntimes[draftRuntimeKey] ?? agentSettings.defaultRuntime)
    : agentSettings.defaultRuntime;
  const activeRuntime = chatRuntime ?? draftRuntime;
  const runtimePageKey = selectedChatId
    ? `chat:${selectedChatId}:${chatRuntime ?? "pending"}`
    : route.type === "projectCreate"
      ? `project-create:${route.projectId}`
      : "create";
  const draftAgentConfigKey = `${runtimePageKey}:${activeRuntime}`;
  const draftAgentConfig =
    draftAgentConfigs[draftAgentConfigKey] ?? EMPTY_DRAFT_AGENT_CONFIG;
  const shouldInspectRuntimeConfig =
    route.type === "create" || route.type === "projectCreate";
  const runtimeConfigQuery = useQuery({
    ...chatRuntimeConfigQueryOptions({
      api,
      cwd: selectedProjectPath ?? undefined,
      enabled: shouldInspectRuntimeConfig,
      runtime: activeRuntime,
    }),
  });
  const runtimeConfig = chatLoadQuery.data?.config ?? runtimeConfigQuery.data;
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
      configLoading: runtimeConfigQuery.isFetching,
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
      runtimeConfigQuery.isFetching,
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

  const upsertChat = useCallback(
    (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => {
      setChatInCache(chat, messages, config);
      navigateToChat(chat);
    },
    [navigateToChat, setChatInCache],
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
        await showProjectContextMenuMutation.mutateAsync(project);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: "Project action failed",
          variant: "destructive",
        });
      }
    },
    [showProjectContextMenuMutation, toast],
  );

  const removeChatFromCache = useCallback(
    (chatId: string) => {
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
        settingsActive={route.type === "settings"}
        standaloneChats={standaloneChats}
      />

      {route.type === "settings" ? (
        <SidebarInset className="h-svh max-h-svh overflow-hidden md:h-[calc(100svh-1rem)] md:max-h-[calc(100svh-1rem)]">
          <WorkspaceHeader />
          <SettingsPage
            agentSettings={agentSettings}
            isDeletingChats={deleteAllChatsMutation.isPending}
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
            model={modelOverride}
            mode={modeOverride}
            onChatCreated={setChatInCache}
            onChatUpdated={upsertChat}
            projectId={selectedChat?.projectId ?? selectedProject?.id ?? null}
            projectPath={selectedProjectPath ?? undefined}
            reasoningEffort={reasoningEffortOverride}
            runtime={activeRuntime}
          >
            <SidebarInset className="h-svh max-h-svh overflow-hidden md:h-[calc(100svh-1rem)] md:max-h-[calc(100svh-1rem)]">
              <WorkspaceHeader />
              <main className="flex min-h-0 flex-1 overflow-hidden">
                <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <AssistantThread projectName={selectedProjectName} />
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
  return value?.trim() || NO_CONFIG_OVERRIDE_VALUE;
}

function selectedConfigOverride(value: string | null | undefined) {
  const normalizedValue = value?.trim();
  if (!normalizedValue || normalizedValue === NO_CONFIG_OVERRIDE_VALUE) {
    return undefined;
  }
  return normalizedValue;
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

function draftRuntimeKeyFromRoute(route: WorkspaceRoute) {
  if (route.type === "create") return "create";
  if (route.type === "projectCreate") return `project:${route.projectId}`;
  return undefined;
}

function getProjectDisplayName(projectPath: string) {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}
