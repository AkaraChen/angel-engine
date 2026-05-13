import type { ReactElement } from "react";
import { MessageSquarePlus, Settings } from "lucide-react";

import {
  AnimatedSidebarMenuItem,
  MacSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { ChatSidebarSection } from "@/features/chat/components/chat-sidebar-section";
import { ProjectSidebarSection } from "@/features/projects/components/project-sidebar-section";
import type { Chat } from "@/shared/chat";
import type { Project } from "@/shared/projects";

type MaybeAsync = void | Promise<void>;

type WorkspaceSidebarProps = {
  isChatsLoading: boolean;
  isMacOS: boolean;
  isProjectsLoading: boolean;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onCreateStandaloneChat: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onOpenSettings: () => MaybeAsync;
  onRenameChat: (chat: Chat) => MaybeAsync;
  onRefreshProjects: () => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  onShowProjectContextMenu: (project: Project) => MaybeAsync;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
  settingsActive: boolean;
  standaloneChats: Chat[];
};

export function WorkspaceSidebar({
  isChatsLoading,
  isMacOS,
  isProjectsLoading,
  onCreateProject,
  onCreateProjectChat,
  onCreateStandaloneChat,
  onOpenChat,
  onOpenSettings,
  onRenameChat,
  onRefreshProjects,
  onShowChatContextMenu,
  onShowProjectContextMenu,
  projectChatsByProjectId,
  projects,
  selectedChatId,
  selectedProjectId,
  settingsActive,
  standaloneChats,
}: WorkspaceSidebarProps): ReactElement {
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-2 pb-2 pt-2" data-electron-drag>
        {isMacOS ? <div aria-hidden className="h-8 shrink-0" /> : null}

        <SidebarMenu className="gap-1">
          <AnimatedSidebarMenuItem>
            <MacSidebarMenuButton onClick={() => void onCreateStandaloneChat()}>
              <MessageSquarePlus />
              <span>New chat</span>
            </MacSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 pb-1">
        <ProjectSidebarSection
          isLoading={isProjectsLoading}
          onCreateProject={onCreateProject}
          onCreateProjectChat={onCreateProjectChat}
          onOpenChat={onOpenChat}
          onRenameChat={onRenameChat}
          onRefreshProjects={onRefreshProjects}
          onShowChatContextMenu={onShowChatContextMenu}
          onShowProjectContextMenu={onShowProjectContextMenu}
          projectChatsByProjectId={projectChatsByProjectId}
          projects={projects}
          selectedChatId={selectedChatId}
          selectedProjectId={selectedProjectId}
        />

        <ChatSidebarSection
          isLoading={isChatsLoading}
          onOpenChat={onOpenChat}
          onRenameChat={onRenameChat}
          onShowChatContextMenu={onShowChatContextMenu}
          selectedChatId={selectedChatId}
          standaloneChats={standaloneChats}
        />
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <AnimatedSidebarMenuItem>
            <MacSidebarMenuButton
              isActive={settingsActive}
              onClick={() => void onOpenSettings()}
            >
              <Settings />
              <span>Settings</span>
            </MacSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
