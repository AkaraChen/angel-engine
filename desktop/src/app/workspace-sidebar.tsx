import {
  Folder,
  FolderPlus,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Settings,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import type { Chat } from '@/shared/chat';
import type { Project } from '@/shared/projects';

const primaryItems = [
  { label: 'New chat', icon: MessageSquarePlus },
  { label: 'Automation', icon: Workflow },
];

type MaybeAsync = void | Promise<void>;

export function WorkspaceSidebar({
  isChatsLoading,
  isMacOS,
  isProjectsLoading,
  onCreateProject,
  onCreateProjectChat,
  onCreateStandaloneChat,
  onOpenChat,
  onOpenProject,
  onOpenSettings,
  onRefreshProjects,
  onShowChatContextMenu,
  onShowProjectContextMenu,
  projectChatsByProjectId,
  projects,
  selectedChatId,
  selectedProjectId,
  settingsActive,
  standaloneChats,
}: {
  isChatsLoading: boolean;
  isMacOS: boolean;
  isProjectsLoading: boolean;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onCreateStandaloneChat: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onOpenProject: (project: Project) => MaybeAsync;
  onOpenSettings: () => MaybeAsync;
  onRefreshProjects: () => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  onShowProjectContextMenu: (project: Project) => MaybeAsync;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
  settingsActive: boolean;
  standaloneChats: Chat[];
}) {
  return (
    <Sidebar variant="inset">
      <SidebarHeader
        className="px-2 pb-3 pt-2"
        data-electron-drag
      >
        {isMacOS ? <div aria-hidden className="h-8 shrink-0" /> : null}
        <SidebarMenu>
          {primaryItems.map(({ label, icon: Icon }) => (
            <SidebarMenuItem key={label}>
              <SidebarMenuButton
                onClick={
                  label === 'New chat'
                    ? () => void onCreateStandaloneChat()
                    : undefined
                }
              >
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between gap-2 pr-2">
            <SidebarGroupLabel>Projects</SidebarGroupLabel>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => void onRefreshProjects()}
                size="icon-xs"
                title="Refresh projects"
                type="button"
                variant="ghost"
              >
                <RefreshCw />
                <span className="sr-only">Refresh projects</span>
              </Button>
              <Button
                onClick={() => void onCreateProject()}
                size="icon-xs"
                title="Add project"
                type="button"
                variant="ghost"
              >
                <FolderPlus />
                <span className="sr-only">Add project</span>
              </Button>
            </div>
          </div>
          <SidebarGroupContent>
            <SidebarMenu>
              {isProjectsLoading ? (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <Loader2 className="animate-spin" />
                    <span>Loading projects</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}

              {!isProjectsLoading && projects.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <Folder />
                    <span>No projects yet</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}

              {projects.map((project) => {
                const projectDisplayName = getProjectDisplayName(project.path);
                const projectChats =
                  projectChatsByProjectId.get(project.id) ?? [];

                return (
                  <SidebarMenuItem key={project.id}>
                    <SidebarMenuButton
                      isActive={project.id === selectedProjectId}
                      onClick={() => void onOpenProject(project)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void onShowProjectContextMenu(project);
                      }}
                      title={project.path}
                    >
                      <Folder />
                      <span className="truncate">{projectDisplayName}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      aria-label={`New chat in ${projectDisplayName}`}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void onCreateProjectChat(project);
                      }}
                      showOnHover
                      title={`New chat in ${projectDisplayName}`}
                      type="button"
                    >
                      <Plus />
                    </SidebarMenuAction>

                    {projectChats.length > 0 ? (
                      <SidebarMenuSub>
                        {projectChats.map((chat) => (
                          <SidebarMenuSubItem key={chat.id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={chat.id === selectedChatId}
                              title={chat.cwd ?? chat.title}
                            >
                              <button
                                onClick={() => void onOpenChat(chat)}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  void onShowChatContextMenu(chat);
                                }}
                                type="button"
                              >
                                <span>{chat.title}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {isChatsLoading ? (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <Loader2 className="animate-spin" />
                    <span>Loading chats</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}

              {!isChatsLoading && standaloneChats.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled>
                    <MessageSquare />
                    <span>No standalone chats</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}

              {standaloneChats.map((chat) => (
                <SidebarMenuItem key={chat.id}>
                  <SidebarMenuButton
                    isActive={chat.id === selectedChatId}
                    onClick={() => void onOpenChat(chat)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void onShowChatContextMenu(chat);
                    }}
                    title={chat.cwd ?? chat.title}
                  >
                    <MessageSquare />
                    <span className="truncate">{chat.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={settingsActive}
              onClick={() => void onOpenSettings()}
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function getProjectDisplayName(projectPath: string) {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}
