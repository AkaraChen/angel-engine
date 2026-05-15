import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocation } from "wouter";
import { useTranslation } from "react-i18next";

import { ChatRestoreLoading } from "@/app/workspace/chat-restore-loading";
import { WorkspaceHeader } from "@/app/workspace/workspace-header";
import {
  WorkspaceSidebarControl,
  WorkspaceSidebarControlPortalProvider,
} from "@/app/workspace/workspace-sidebar-control";
import { WorkspaceSidebar } from "@/app/workspace/workspace-sidebar";
import {
  ActiveChatThread,
  ChatRestoreErrorBoundary,
  RestoredChatThread,
} from "@/app/workspace/workspace-chat-thread";
import { DraftChatThread } from "@/app/workspace/draft-chat-thread";
import { RenameChatDialog } from "@/features/chat/components/rename-chat-dialog";
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAgentSettings } from "@/features/settings/use-agent-settings";
import { useToast } from "@/components/ui/toast";
import { useApi } from "@/platform/use-api";
import {
  cancelAllChatRuns,
  cancelChatRun,
  setActiveChatRunId,
  useChatAttentionSummary,
  useChatRunIsRunning,
} from "@/features/chat/state/chat-run-store";
import { SettingsPage } from "@/features/settings/settings-page";
import {
  archiveChatMutationOptions,
  chatContextMenuMutationOptions,
  chatListQueryOptions,
  chatPrewarmQueryOptions,
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
  type AgentRuntime,
} from "@/shared/agents";
import type {
  Chat,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatRuntimeConfig,
} from "@/shared/chat";
import type { Project } from "@/shared/projects";
import { useDraftProjectContext } from "@/app/workspace/use-draft-project-context";
import { useDraftChatOptions } from "@/app/workspace/use-draft-chat-options";
import {
  currentHashRoutePath,
  chatNotificationRoutePath,
  chatRoutePath,
  chatRoutePathId,
  projectChatRoutePath,
  projectDraftRoutePath,
} from "@/app/workspace/workspace-route-paths";
import {
  draftRuntimeKeyFromProjectId,
  workspaceRuntimePageKey,
} from "@/app/workspace/workspace-runtime-keys";
import {
  getErrorMessage,
  getProjectDisplayName,
  getWorkspaceTitle,
} from "@/app/workspace/workspace-display";
import type { DraftAgentConfig } from "@/app/workspace/workspace-thread-types";

const EMPTY_CHATS: Chat[] = [];
const EMPTY_PROJECTS: Project[] = [];

type WorkspacePageContentProps = {
  api: ReturnType<typeof useApi>;
  currentRoutePath: string;
  draftProjectId?: string;
  routeProjectId?: string;
  selectedChatId?: string;
  settingsActive?: boolean;
};

export function WorkspaceDraftPage({ projectId }: { projectId?: string }) {
  const api = useApi();

  return (
    <WorkspacePageContent
      api={api}
      currentRoutePath={projectId ? projectDraftRoutePath(projectId) : "/"}
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
        projectId
          ? projectChatRoutePath(projectId, chatId)
          : chatRoutePathId(chatId)
      }
      routeProjectId={projectId}
      selectedChatId={chatId}
    />
  );
}

export function WorkspaceSettingsPage() {
  const api = useApi();

  return (
    <WorkspacePageContent
      api={api}
      currentRoutePath="/settings"
      settingsActive
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
  const isDraftPage = !selectedChatId && !settingsActive;

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
  const draftProject = useDraftProjectContext(
    projects,
    isDraftPage ? routeDraftProjectId : undefined,
  );
  const selectedProjectId = isDraftPage
    ? draftProject.id
    : (routeProjectId ?? selectedChat?.projectId ?? undefined);
  const selectedProject = selectedProjectId
    ? projects.find((project) => project.id === selectedProjectId)
    : undefined;
  const selectedProjectPath = isDraftPage
    ? draftProject.path
    : (selectedProject?.path ?? selectedChat?.cwd);
  const selectedProjectName = isDraftPage
    ? draftProject.name
    : selectedProjectPath
      ? getProjectDisplayName(selectedProjectPath)
      : undefined;
  const workspaceTitle = getWorkspaceTitle({
    selectedChat,
    selectedProjectName,
    settingsActive,
    t,
  });
  const chatRuntime = selectedChat?.runtime as AgentRuntime | undefined;
  const runtimePageKey = workspaceRuntimePageKey({
    chatRuntime,
    draftProjectId: routeDraftProjectId,
    selectedChatId,
    settingsActive,
  });
  const draftRuntimeKey = isDraftPage
    ? draftRuntimeKeyFromProjectId(routeDraftProjectId)
    : undefined;
  const draftRuntime = draftRuntimeKey
    ? resolveEnabledAgentRuntime(agentSettings, draftRuntimes[draftRuntimeKey])
    : agentSettings.defaultRuntime;
  const activeRuntime = chatRuntime ?? draftRuntime;
  const shouldPrewarmChat =
    isDraftPage && (!routeDraftProjectId || Boolean(draftProject.path));
  const prewarmQuery = useQuery({
    ...chatPrewarmQueryOptions({
      api,
      enabled: shouldPrewarmChat,
      projectId: draftProject.id,
      runtime: activeRuntime,
    }),
  });
  const runtimeConfig = prewarmQuery.data?.config;
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
    configLoading: prewarmQuery.isFetching,
    draftAgentConfigs,
    draftRuntimeKey,
    runtimeConfig,
    runtimeOptions,
    runtimePageKey,
    setDraftAgentConfigs,
    setDraftRuntimes,
  });

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
      if (isDraftPage && currentHashRoutePath() === currentRoutePath) {
        navigateToChat(chat);
      }
    },
    [currentRoutePath, isDraftPage, navigateToChat, setChatInCache],
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

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await api.projects.chooseDirectory();
      if (!selectedPath) return undefined;

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
      const path = projectId ? projectDraftRoutePath(projectId) : "/";
      if (location !== path) {
        navigate(path, options);
      }
    },
    [location, navigate],
  );

  const archiveChat = useCallback(
    async (chat: Chat) => {
      try {
        const archivedChat = await archiveChatMutation.mutateAsync(chat);

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
      navigateToDraft(project.id);
    },
    [navigateToDraft],
  );

  const createChatForSelection = useCallback(() => {
    navigateToDraft();
  }, [navigateToDraft]);

  const selectDraftProject = useCallback(
    (projectId: string | null) => {
      navigateToDraft(projectId ?? undefined);
    },
    [navigateToDraft],
  );

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
          standaloneChats={standaloneChats}
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

        {settingsActive ? (
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
                          draftAgentConfig={draftAgentConfig}
                          onChatCreated={updateChatFromRun}
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
                  <DraftChatThread
                    chatOptions={chatOptions}
                    key={runtimePageKey}
                    model={modelOverride}
                    mode={modeOverride}
                    onChatCreated={updateChatFromRun}
                    onChatUpdated={updateChatFromRun}
                    onCreateProject={createProjectFromPicker}
                    onProjectChange={selectDraftProject}
                    permissionMode={permissionModeOverride}
                    prewarmId={prewarmQuery.data?.prewarmId}
                    projectId={draftProject.id}
                    projectName={selectedProjectName}
                    projectPath={draftProject.path}
                    projects={projects}
                    reasoningEffort={reasoningEffortOverride}
                    runtime={activeRuntime}
                    runtimeConfig={runtimeConfig}
                    slotKey={runtimePageKey}
                  />
                )}
              </section>
            </main>
          </SidebarInset>
        )}
      </WorkspaceSidebarControlPortalProvider>
    </SidebarProvider>
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
