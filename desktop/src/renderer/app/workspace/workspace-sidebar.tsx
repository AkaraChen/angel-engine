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
import { m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
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
const FLOATING_SIDEBAR_OPEN_DELAY_MS = 80;
const FLOATING_SIDEBAR_CLOSE_DELAY_MS = 140;
const FLOATING_SIDEBAR_TRANSITION = {
  damping: 36,
  mass: 0.8,
  stiffness: 420,
  type: "spring",
} as const;

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
  ...props
}: WorkspaceSidebarProps): ReactElement {
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  return (
    <Sidebar
      className="select-none"
      data-workspace-mode={workspaceMode}
      variant="inset"
    >
      <WorkspaceSidebarContent {...props} />
    </Sidebar>
  );
}

export function WorkspaceFloatingSidebar(
  props: WorkspaceSidebarProps,
): ReactElement | null {
  const sidebarOpen = useWorkspaceUiStore((state) => state.sidebarOpen);
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const [peeked, setPeeked] = useState(false);
  const openTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (sidebarOpen) {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      setPeeked(false);
    }
  }, [sidebarOpen]);

  useEffect(
    () => () => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
      }
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    },
    [],
  );

  if (sidebarOpen) {
    return null;
  }

  const handlePeekEnter = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (peeked || openTimerRef.current !== null) return;
    openTimerRef.current = window.setTimeout(() => {
      setPeeked(true);
      openTimerRef.current = null;
    }, FLOATING_SIDEBAR_OPEN_DELAY_MS);
  };

  const handlePeekLeave = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setPeeked(false);
      closeTimerRef.current = null;
    }, FLOATING_SIDEBAR_CLOSE_DELAY_MS);
  };

  return (
    <div
      className="hidden text-sidebar-foreground md:block"
      data-slot="workspace-floating-sidebar"
      data-workspace-mode={workspaceMode}
      onMouseEnter={handlePeekEnter}
      onMouseLeave={handlePeekLeave}
    >
      <div
        aria-hidden="true"
        className="fixed inset-y-0 left-0 z-20 w-6"
        data-slot="workspace-floating-sidebar-trigger"
      />
      <m.aside
        animate={{ x: peeked ? 0 : "-110%" }}
        aria-hidden={!peeked}
        className="
          fixed inset-y-0 left-0 z-30 hidden h-svh w-(--sidebar-width) p-2
          md:flex
        "
        data-slot="workspace-floating-sidebar-container"
        inert={!peeked ? true : undefined}
        initial={false}
        transition={FLOATING_SIDEBAR_TRANSITION}
      >
        <div
          className="
            flex size-full flex-col rounded-lg
            bg-[var(--macos-sidebar-background)] shadow-xl ring-1
            ring-sidebar-border
          "
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-workspace-mode={workspaceMode}
        >
          <WorkspaceSidebarContent {...props} />
        </div>
      </m.aside>
    </div>
  );
}

function WorkspaceSidebarContent({
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
    <>
      <SidebarHeader className="p-2" data-electron-drag>
        {isMacOS ? <div aria-hidden className="h-8 shrink-0" /> : null}

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
            mx-2 mb-1 h-px shrink-0 bg-black/6
            dark:bg-white/8
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
    </>
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
          dark:bg-white/5.5 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]
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
                  flex h-7 min-w-0 items-center justify-center gap-1.5
                  rounded-[5px] px-2
                  [font-size:var(--workspace-sidebar-label-text-size)]
                  font-medium text-sidebar-foreground/58 outline-hidden
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
              <Icon className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
