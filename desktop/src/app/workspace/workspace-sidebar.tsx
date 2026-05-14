import { type ComponentType, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Folder, List, MessageSquarePlus, Rows3, Settings } from "lucide-react";

import {
  AnimatedSidebarMenuItem,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import { cn } from "@/platform/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { ChatSidebarSection } from "@/features/chat/components/chat-sidebar-section";
import { SimpleChatSidebarSection } from "@/features/chat/components/simple-chat-sidebar-section";
import { ProjectSidebarSection } from "@/features/projects/components/project-sidebar-section";
import {
  useWorkspaceUiStore,
  type SidebarViewMode,
} from "@/app/workspace/workspace-ui-store";
import type { Chat } from "@/shared/chat";
import type { Project } from "@/shared/projects";

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

type WorkspaceSidebarProps = {
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
};

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

  return (
    <Sidebar className="select-none" variant="inset">
      <SidebarHeader className="px-2 pb-2 pt-2" data-electron-drag>
        {isMacOS ? <div aria-hidden className="h-8 shrink-0" /> : null}

        <SidebarViewModeControl onValueChange={setViewMode} value={viewMode} />
      </SidebarHeader>

      <SidebarContent className="gap-1 pb-1">
        {viewMode !== "project" ? (
          <SidebarMenu className="px-2">
            <AnimatedSidebarMenuItem>
              <WorkspaceSidebarMenuButton
                onClick={() => void onCreateStandaloneChat()}
              >
                <MessageSquarePlus />
                <span>{t("sidebar.newChat")}</span>
              </WorkspaceSidebarMenuButton>
            </AnimatedSidebarMenuItem>
          </SidebarMenu>
        ) : null}

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
    <div className="px-1 group-data-[collapsible=icon]:hidden">
      <div
        aria-label="view"
        className="grid grid-cols-3 gap-0.5 rounded-xl bg-sidebar-accent/60 p-1"
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
                "flex h-8 min-w-0 items-center justify-center rounded-lg px-2 text-sidebar-foreground/70 outline-hidden transition-colors hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                isActive
                  ? "bg-background text-sidebar-foreground shadow-[0_0_0_1px_hsl(var(--sidebar-border))]"
                  : "hover:bg-sidebar-accent",
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
