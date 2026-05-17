import type { Chat } from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ComponentType, ReactElement } from "react";

import type { SidebarViewMode } from "@/app/workspace/workspace-ui-store";
import {
  RiFolderLine as Folder,
  RiListUnordered as List,
  RiChatNewLine as MessageSquarePlus,
  RiLayoutRowLine as Rows3,
  RiSettings3Line as Settings,
} from "@remixicon/react";
import { useTranslation } from "react-i18next";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import {
  AnimatedSidebarMenuItem,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import { ChatSidebarSection } from "@/features/chat/components/chat-sidebar-section";
import { SimpleChatSidebarSection } from "@/features/chat/components/simple-chat-sidebar-section";
import { ProjectSidebarSection } from "@/features/projects/components/project-sidebar-section";
import { cn } from "@/platform/utils";

type MaybeAsync = void | Promise<void>;

const SIDEBAR_VIEW_MODES: Array<{
  icon: ComponentType<{ className?: string }>;
  value: SidebarViewMode;
}> = [
  { icon: List, value: "simple" },
  { icon: Folder, value: "project" },
  {
    icon: Rows3,
    value: "mixed",
  },
];

interface WorkspaceSidebarProps {
  chats: Chat[];
  isChatsLoading: boolean;
  isMacOS: boolean;
  isProjectsLoading: boolean;
  onArchiveChat: (chat: Chat) => MaybeAsync;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onCreateStandaloneChat: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onOpenSettings: () => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  onShowProjectContextMenu: (project: Project) => MaybeAsync;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
  settingsActive: boolean;
  standaloneChats: Chat[];
}

export function WorkspaceSidebar({
  chats,
  isChatsLoading,
  isMacOS,
  isProjectsLoading,
  onArchiveChat,
  onCreateProject,
  onCreateProjectChat,
  onCreateStandaloneChat,
  onOpenChat,
  onOpenSettings,
  onShowChatContextMenu,
  onShowProjectContextMenu,
  projectChatsByProjectId,
  projects,
  selectedChatId,
  selectedProjectId,
  settingsActive,
  standaloneChats,
}: WorkspaceSidebarProps): ReactElement {
  const { t } = useTranslation();
  const viewMode = useWorkspaceUiStore((state) => state.sidebarViewMode);
  const setViewMode = useWorkspaceUiStore((state) => state.setSidebarViewMode);
  const createChatFromNewButton = async () => {
    if (viewMode === "project") {
      const firstProject = projects[0];
      if (firstProject) {
        return onCreateProjectChat(firstProject);
      }
    }

    return onCreateStandaloneChat();
  };

  return (
    <Sidebar className="select-none" variant="inset">
      <SidebarHeader className="p-2" data-electron-drag>
        {isMacOS ? <div aria-hidden className="h-8 shrink-0" /> : null}

        <SidebarViewModeControl onValueChange={setViewMode} value={viewMode} />
      </SidebarHeader>

      <SidebarContent className="gap-0 pb-1">
        <SidebarMenu className="px-2 py-2.5">
          <AnimatedSidebarMenuItem>
            <WorkspaceSidebarMenuButton
              onClick={() => void createChatFromNewButton()}
            >
              <MessageSquarePlus />
              <span>{t("sidebar.newChat")}</span>
            </WorkspaceSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </SidebarMenu>

        <div
          aria-hidden="true"
          className="
            mx-2 mb-1 h-px shrink-0 bg-black/[0.06]
            dark:bg-white/[0.08]
          "
        />

        {viewMode === "simple" ? (
          <SimpleChatSidebarSection
            chats={chats}
            isLoading={isChatsLoading}
            onArchiveChat={onArchiveChat}
            onOpenChat={onOpenChat}
            onShowChatContextMenu={onShowChatContextMenu}
            selectedChatId={selectedChatId}
          />
        ) : null}

        {viewMode === "project" ? (
          <ProjectSidebarSection
            isLoading={isProjectsLoading}
            onArchiveChat={onArchiveChat}
            onCreateProject={onCreateProject}
            onCreateProjectChat={onCreateProjectChat}
            onOpenChat={onOpenChat}
            onShowChatContextMenu={onShowChatContextMenu}
            onShowProjectContextMenu={onShowProjectContextMenu}
            projectChatsByProjectId={projectChatsByProjectId}
            projects={projects}
            selectedChatId={selectedChatId}
            selectedProjectId={selectedProjectId}
          />
        ) : null}

        {viewMode === "mixed" ? (
          <>
            <ProjectSidebarSection
              isLoading={isProjectsLoading}
              onArchiveChat={onArchiveChat}
              onCreateProject={onCreateProject}
              onCreateProjectChat={onCreateProjectChat}
              onOpenChat={onOpenChat}
              onShowChatContextMenu={onShowChatContextMenu}
              onShowProjectContextMenu={onShowProjectContextMenu}
              projectChatsByProjectId={projectChatsByProjectId}
              projects={projects}
              selectedChatId={selectedChatId}
              selectedProjectId={selectedProjectId}
            />

            <ChatSidebarSection
              isLoading={isChatsLoading}
              onArchiveChat={onArchiveChat}
              onOpenChat={onOpenChat}
              onShowChatContextMenu={onShowChatContextMenu}
              selectedChatId={selectedChatId}
              standaloneChats={standaloneChats}
            />
          </>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <AnimatedSidebarMenuItem>
            <WorkspaceSidebarMenuButton
              isActive={settingsActive}
              onClick={() => void onOpenSettings()}
            >
              <Settings />
              <span>{t("sidebar.settings")}</span>
            </WorkspaceSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarViewModeControl({
  onValueChange,
  value,
}: {
  onValueChange: (value: SidebarViewMode) => void;
  value: SidebarViewMode;
}): ReactElement {
  return (
    <div
      className="
        px-1
        group-data-[collapsible=icon]:hidden
      "
    >
      <div
        aria-label="view"
        className="
          grid grid-cols-3 gap-0.5 rounded-md bg-black/[0.055] p-0.5
          shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]
          dark:bg-white/[0.055]
          dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]
        "
        role="group"
      >
        {SIDEBAR_VIEW_MODES.map((option) => {
          const Icon = option.icon;
          const isActive = value === option.value;

          return (
            <button
              aria-label={option.value}
              aria-pressed={isActive}
              className={cn(
                `
                  flex h-7 min-w-0 items-center justify-center rounded-[5px]
                  px-2 text-sidebar-foreground/58 outline-hidden
                  transition-[background-color,color,box-shadow]
                  hover:bg-white/25 hover:text-sidebar-foreground/78
                  focus-visible:bg-white/40 focus-visible:text-sidebar-foreground
                  dark:hover:bg-white/[0.055] dark:focus-visible:bg-white/[0.1]
                `,
                isActive
                  ? `
                    bg-white/58 text-sidebar-foreground
                    shadow-[0_1px_2px_rgba(0,0,0,0.08)]
                    dark:bg-white/[0.14]
                    dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                  `
                  : "",
              )}
              key={option.value}
              onClick={() => onValueChange(option.value)}
              type="button"
            >
              <Icon className="size-4 shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
