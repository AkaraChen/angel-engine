import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";

import type { PathLauncherActionId } from "@shared/path-launcher";
import type { ChatContextMenuAction } from "@/features/chat/api/queries";
import type { ProjectContextMenuAction } from "@/features/projects/api/queries";
import { Plus, GearSix as Settings, SquaresFour } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { m } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { resolveWorkspaceNewChatTarget } from "@/app/workspace/workspace-new-chat-target";
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

type MaybeAsync = void | Promise<void>;
const FLOATING_SIDEBAR_OPEN_DELAY_MS = 80;
const FLOATING_SIDEBAR_CLOSE_DELAY_MS = 140;
const FLOATING_SIDEBAR_TRANSITION = {
  damping: 36,
  mass: 0.8,
  stiffness: 420,
  type: "spring",
} as const;

interface WorkspaceSidebarProps {
  chats: Chat[];
  fleetActive: boolean;
  isChatsLoading: boolean;
  isMacOS: boolean;
  isProjectsLoading: boolean;
  onArchiveChat: (chat: Chat) => MaybeAsync;
  onCloneRepository: () => MaybeAsync;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onCreateStandaloneChat: () => MaybeAsync;
  onImportSession: (project: Project) => void;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onOpenFleet: () => MaybeAsync;
  onOpenSettings: () => MaybeAsync;
  onChatContextMenuAction: (chat: Chat, action: ChatContextMenuAction) => void;
  onProjectContextMenuAction: (
    project: Project,
    action: ProjectContextMenuAction,
  ) => void;
  onProjectPathLauncherAction: (
    project: Project,
    action: PathLauncherActionId,
  ) => void;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
}

export function WorkspaceSidebar({
  ...props
}: WorkspaceSidebarProps): ReactElement {
  return (
    <Sidebar className="select-none" variant="inset">
      <WorkspaceSidebarContent {...props} />
    </Sidebar>
  );
}

export function WorkspaceFloatingSidebar(
  props: WorkspaceSidebarProps,
): ReactElement | null {
  const sidebarOpen = useWorkspaceUiStore((state) => state.sidebarOpen);
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
      className="
        hidden text-sidebar-foreground
        md:block
      "
      data-slot="workspace-floating-sidebar"
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
            flex size-full flex-col rounded-lg bg-(--macos-sidebar-background)
            shadow-xl ring-1 ring-sidebar-border
          "
          data-sidebar="sidebar"
          data-slot="sidebar"
        >
          <WorkspaceSidebarContent {...props} />
        </div>
      </m.aside>
    </div>
  );
}

function WorkspaceSidebarContent({
  chats,
  fleetActive,
  isChatsLoading,
  isMacOS,
  isProjectsLoading,
  onArchiveChat,
  onCloneRepository,
  onCreateProject,
  onCreateProjectChat,
  onCreateStandaloneChat,
  onImportSession,
  onOpenChat,
  onOpenFleet,
  onOpenSettings,
  onChatContextMenuAction,
  onProjectContextMenuAction,
  onProjectPathLauncherAction,
  projectChatsByProjectId,
  projects,
  selectedChatId,
  selectedProjectId,
}: WorkspaceSidebarProps): ReactElement {
  const { t } = useTranslation();
  const platform = window.desktopEnvironment.platform;
  const reserveNativeSidebarControlSpace =
    platform === "linux" || platform === "win32";
  const standaloneChats = chats.filter(
    (chat) => !is.nonEmptyString(chat.projectId),
  );
  const createChatFromNewButton = async () => {
    const target = resolveWorkspaceNewChatTarget({
      fleetActive,
      projects,
      selectedChatId,
      selectedProjectId,
    });

    switch (target.type) {
      case "none":
        return;
      case "project":
        return onCreateProjectChat(target.project);
      case "standalone":
        return onCreateStandaloneChat();
    }
  };

  return (
    <>
      <SidebarHeader className="p-2" data-electron-drag>
        {isMacOS || reserveNativeSidebarControlSpace ? (
          <div aria-hidden className="h-8 shrink-0" />
        ) : null}
      </SidebarHeader>

      <SidebarContent className="gap-0 pb-1">
        <SidebarMenu className="px-2 py-2.5">
          <AnimatedSidebarMenuItem>
            {/* The sidebar's primary CTA. It reads from the theme accent
                rather than a status colour; green here would claim "success",
                which starting a chat is not. The fill is `--primary-strong`
                because it carries a label -- see `button.tsx`. */}
            <WorkspaceSidebarMenuButton
              className="
                bg-primary-strong text-primary-foreground
                hover:bg-primary-strong-hover hover:text-primary-foreground
                focus-visible:bg-primary-strong-hover
                active:bg-primary-strong-active active:text-primary-foreground
                data-active:bg-primary-strong data-active:text-primary-foreground
                [&_svg]:text-primary-foreground!
              "
              onClick={() => void createChatFromNewButton()}
            >
              <Plus weight="bold" />
              <span>{t("sidebar.newChat")}</span>
            </WorkspaceSidebarMenuButton>
          </AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuItem>
            <WorkspaceSidebarMenuButton
              isActive={fleetActive}
              onClick={() => void onOpenFleet()}
            >
              <SquaresFour weight="duotone" />
              <span>{t("fleet.title")}</span>
            </WorkspaceSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </SidebarMenu>

        <SimpleChatSidebarSection
          chats={standaloneChats}
          isLoading={isChatsLoading}
          onArchiveChat={onArchiveChat}
          onOpenChat={onOpenChat}
          onChatContextMenuAction={onChatContextMenuAction}
          selectedChatId={selectedChatId}
        />

        <ProjectSidebarSection
          isLoading={isProjectsLoading}
          onArchiveChat={onArchiveChat}
          onCloneRepository={onCloneRepository}
          onCreateProject={onCreateProject}
          onCreateProjectChat={onCreateProjectChat}
          onImportSession={onImportSession}
          onOpenChat={onOpenChat}
          onChatContextMenuAction={onChatContextMenuAction}
          onProjectContextMenuAction={onProjectContextMenuAction}
          onProjectPathLauncherAction={onProjectPathLauncherAction}
          projectChatsByProjectId={projectChatsByProjectId}
          projects={projects}
          selectedChatId={selectedChatId}
        />
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <AnimatedSidebarMenuItem>
            <WorkspaceSidebarMenuButton onClick={() => void onOpenSettings()}>
              <Settings weight="duotone" />
              <span>{t("sidebar.settings")}</span>
            </WorkspaceSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}
