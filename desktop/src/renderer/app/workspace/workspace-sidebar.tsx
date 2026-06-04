import type { Chat } from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ComponentType, ReactElement } from "react";

import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";
import {
  RiFolderLine as Folder,
  RiMessage2Line as MessageSquare,
  RiChatNewLine as MessageSquarePlus,
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
import { SimpleChatSidebarSection } from "@/features/chat/components/simple-chat-sidebar-section";
import { ProjectSidebarSection } from "@/features/projects/components/project-sidebar-section";
import { cn } from "@/platform/utils";

type MaybeAsync = void | Promise<void>;

const WORKSPACE_MODES: Array<{
  icon: ComponentType<{ className?: string }>;
  labelKey: "sidebar.modeChat" | "sidebar.modeWork";
  value: WorkspaceMode;
}> = [
  { icon: MessageSquare, labelKey: "sidebar.modeChat", value: "chat" },
  { icon: Folder, labelKey: "sidebar.modeWork", value: "work" },
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
}: WorkspaceSidebarProps): ReactElement {
  const { t } = useTranslation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const setWorkspaceMode = useWorkspaceUiStore(
    (state) => state.setWorkspaceMode,
  );
  const createChatFromNewButton = async () => {
    if (workspaceMode === "work") {
      const selectedProject = projects.find(
        (project) => project.id === selectedProjectId,
      );
      if (selectedProject !== undefined) {
        return onCreateProjectChat(selectedProject);
      }
      if (projects.length > 0) {
        return onCreateProjectChat(projects[0]);
      }
    }

    return onCreateStandaloneChat();
  };

  return (
    <Sidebar
      className="select-none"
      data-workspace-mode={workspaceMode}
      variant="inset"
    >
      <SidebarHeader className="p-2" data-electron-drag>
        {isMacOS ? <div aria-hidden className="h-[2rem] shrink-0" /> : null}

        <WorkspaceModeControl
          onValueChange={setWorkspaceMode}
          value={workspaceMode}
        />
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

        {workspaceMode === "chat" ? (
          <SimpleChatSidebarSection
            chats={chats}
            isLoading={isChatsLoading}
            onArchiveChat={onArchiveChat}
            onOpenChat={onOpenChat}
            onShowChatContextMenu={onShowChatContextMenu}
            selectedChatId={selectedChatId}
          />
        ) : null}

        {workspaceMode === "work" ? (
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
          />
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

function WorkspaceModeControl({
  onValueChange,
  value,
}: {
  onValueChange: (value: WorkspaceMode) => void;
  value: WorkspaceMode;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      className="
        px-1
        group-data-[collapsible=icon]:hidden
      "
    >
      <div
        aria-label={t("sidebar.modeSwitcher")}
        className="
          grid grid-cols-2 gap-0.5 rounded-md bg-black/5.5 p-0.5
          shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]
          dark:bg-white/5.5
          dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]
        "
        role="group"
      >
        {WORKSPACE_MODES.map((option) => {
          const Icon = option.icon;
          const isActive = value === option.value;
          const label = t(option.labelKey);

          return (
            <button
              aria-label={label}
              aria-pressed={isActive}
              className={cn(
                `
                  flex h-[1.75rem] min-w-0 items-center justify-center gap-1.5
                  rounded-[5px] px-2
                  [font-size:var(--workspace-sidebar-label-text-size)]
                  font-medium
                  text-sidebar-foreground/58 outline-hidden
                  transition-[background-color,color,box-shadow]
                  hover:bg-white/25 hover:text-sidebar-foreground/78
                  focus-visible:bg-white/40
                  focus-visible:text-sidebar-foreground
                  dark:hover:bg-white/5.5
                  dark:focus-visible:bg-white/10
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
              title={label}
              type="button"
            >
              <Icon className="size-[1rem] shrink-0" />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
