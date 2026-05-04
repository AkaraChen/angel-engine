import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';

import { AppRuntimeProvider } from '@/app/app-runtime-provider';
import { WorkspaceHeader } from '@/app/workspace-header';
import { WorkspaceSidebar } from '@/app/workspace-sidebar';
import { AssistantThread } from '@/chat/assistant-thread';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { useToast } from '@/components/ui/toast';
import { ipc } from '@/lib/ipc';
import { SettingsPage } from '@/pages/settings-page';
import type { Chat, ChatHistoryMessage } from '@/shared/chat';
import type { Project } from '@/shared/projects';

export type WorkspaceRoute =
  | { type: 'create' }
  | { chatId: string; type: 'chat' }
  | { chatId: string; projectId: string; type: 'projectChat' }
  | { type: 'settings' };

export function WorkspacePage({ route }: { route: WorkspaceRoute }) {
  const toast = useToast();
  const [location, navigate] = useLocation();
  const isMacOS = window.desktopEnvironment.platform === 'darwin';
  const [chats, setChats] = useState<Chat[]>([]);
  const [historyMessages, setHistoryMessages] = useState<ChatHistoryMessage[]>([]);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [isChatsLoading, setIsChatsLoading] = useState(true);
  const [isProjectsLoading, setIsProjectsLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);

  const selectedChatId =
    route.type === 'chat' || route.type === 'projectChat'
      ? route.chatId
      : undefined;
  const currentRoutePath = routePath(route);
  const selectedChat = chats.find((chat) => chat.id === selectedChatId);
  const selectedProjectId =
    route.type === 'projectChat'
      ? route.projectId
      : selectedChat?.projectId ?? undefined;
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

  const mergeChat = useCallback((chat: Chat) => {
    setChats((current) => {
      const next = current.filter((item) => item.id !== chat.id);
      next.unshift(chat);
      return next.sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
      );
    });
  }, []);

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
    (chat: Chat) => {
      mergeChat(chat);
      navigateToChat(chat);
    },
    [mergeChat, navigateToChat]
  );

  const refreshProjects = useCallback(async () => {
    setIsProjectsLoading(true);

    try {
      setProjects(await ipc.projectsList());
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not load projects',
        variant: 'destructive',
      });
    } finally {
      setIsProjectsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (!selectedChatId) {
      setHistoryMessages([]);
      setHistoryRevision((revision) => revision + 1);
      return;
    }

    let cancelled = false;
    setHistoryMessages([]);
    setHistoryRevision((revision) => revision + 1);

    const loadRouteChat = async () => {
      try {
        const result = await ipc.chatsLoad(selectedChatId);
        if (cancelled) return;

        mergeChat(result.chat);
        setHistoryMessages(result.messages);
        setHistoryRevision((revision) => revision + 1);

        const canonicalPath = chatRoutePath(result.chat);
        if (canonicalPath !== currentRoutePath) {
          navigate(canonicalPath, { replace: true });
        }
      } catch (error) {
        if (cancelled) return;
        toast({
          description: getErrorMessage(error),
          title: 'Could not load chat',
          variant: 'destructive',
        });
        navigate('/', { replace: true });
      }
    };

    void loadRouteChat();

    return () => {
      cancelled = true;
    };
  }, [currentRoutePath, mergeChat, navigate, selectedChatId, toast]);

  const refreshChats = useCallback(async () => {
    setIsChatsLoading(true);

    try {
      setChats(await ipc.chatsList());
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not load chats',
        variant: 'destructive',
      });
    } finally {
      setIsChatsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await ipc.projectsChooseDirectory();
      if (!selectedPath) return;

      await ipc.projectsCreate({ path: selectedPath });
      await refreshProjects();
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: 'Could not add project',
        variant: 'destructive',
      });
    }
  }, [refreshProjects, toast]);

  const showProjectContextMenu = useCallback(
    async (project: Project) => {
      try {
        const action = await ipc.projectsShowContextMenu(project.id);
        if (action === 'deleted') {
          await refreshProjects();
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Project action failed',
          variant: 'destructive',
        });
      }
    },
    [refreshProjects, toast]
  );

  const removeChatFromState = useCallback(
    (chatId: string) => {
      setChats((current) => current.filter((chat) => chat.id !== chatId));

      if (selectedChatId === chatId) {
        navigate('/', { replace: true });
      }
    },
    [navigate, selectedChatId]
  );

  const showChatContextMenu = useCallback(
    async (chat: Chat) => {
      try {
        const action = await ipc.chatsShowContextMenu(chat.id);
        if (action === 'deleted') {
          removeChatFromState(chat.id);
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Chat action failed',
          variant: 'destructive',
        });
      }
    },
    [removeChatFromState, toast]
  );

  const createChatForProject = useCallback(
    async (project: Project) => {
      try {
        const chat = await ipc.chatsCreate({
          cwd: project.path,
          projectId: project.id,
        });
        upsertChat(chat);
        setHistoryMessages([]);
        setHistoryRevision((revision) => revision + 1);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: 'Could not create chat',
          variant: 'destructive',
        });
      }
    },
    [toast, upsertChat]
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

  const openProject = useCallback(
    (project: Project) => {
      const firstProjectChat = projectChatsByProjectId.get(project.id)?.[0];
      if (firstProjectChat) {
        navigateToChat(firstProjectChat);
      }
    },
    [navigateToChat, projectChatsByProjectId]
  );

  const deleteAllChats = useCallback(async () => {
    const result = await ipc.chatsDeleteAll();
    setChats([]);
    setHistoryMessages([]);
    setHistoryRevision((revision) => revision + 1);
    toast({
      description: `Deleted ${result.deletedCount} chat${
        result.deletedCount === 1 ? '' : 's'
      }.`,
      title: 'Chats deleted',
    });
  }, [toast]);

  return (
    <SidebarProvider>
      <WorkspaceSidebar
        isChatsLoading={isChatsLoading}
        isMacOS={isMacOS}
        isProjectsLoading={isProjectsLoading}
        onCreateProject={createProjectFromPicker}
        onCreateProjectChat={createChatForProject}
        onCreateStandaloneChat={createChatForSelection}
        onOpenChat={openChat}
        onOpenProject={openProject}
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
          <SettingsPage onDeleteAllChats={deleteAllChats} />
        </SidebarInset>
      ) : (
        <AppRuntimeProvider
          chatId={selectedChatId}
          historyMessages={historyMessages}
          historyRevision={historyRevision}
          onChatUpdated={upsertChat}
          projectId={selectedChat?.projectId ?? null}
          projectPath={selectedChat?.cwd ?? undefined}
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
      )}
    </SidebarProvider>
  );
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
