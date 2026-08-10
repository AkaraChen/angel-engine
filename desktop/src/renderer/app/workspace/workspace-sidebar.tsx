import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType, ReactElement } from "react";

import type { PathLauncherActionId } from "@shared/path-launcher";
import type { WorkspaceMode } from "@/app/workspace/workspace-ui-store";
import type { ChatContextMenuAction } from "@/features/chat/api/queries";
import type { ProjectWorktreeChatGroup } from "@/features/chat/worktree-grouping";
import type { ProjectContextMenuAction } from "@/features/projects/api/queries";
import {
  Folder,
  GitPullRequest,
  Lightning,
  Chats as MessageSquare,
  Plus,
  CalendarDots,
  DownloadSimple,
  GearSix as Settings,
  SquaresFour,
} from "@phosphor-icons/react";
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
import { PowerProjectSidebarSection } from "@/features/projects/components/power-project-sidebar-section";
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
  icon: ComponentType<Pick<IconProps, "className" | "weight">>;
  labelKey: "sidebar.modeChat" | "sidebar.modePower" | "sidebar.modeWork";
  value: WorkspaceMode;
}> = [
  { icon: MessageSquare, labelKey: "sidebar.modeChat", value: "chat" },
  { icon: Folder, labelKey: "sidebar.modeWork", value: "work" },
  { icon: Lightning, labelKey: "sidebar.modePower", value: "power" },
];

interface WorkspaceSidebarProps {
  chats: Chat[];
  fleetActive: boolean;
  scheduleActive: boolean;
  isChatsLoading: boolean;
  isMacOS: boolean;
  isProjectsLoading: boolean;
  onArchiveChat: (chat: Chat) => MaybeAsync;
  onCloneRepository: () => MaybeAsync;
  onCancelWorktreeCreation: (chat: Chat) => MaybeAsync;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onCreateStandaloneChat: () => MaybeAsync;
  onImportSession: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onOpenFleet: () => MaybeAsync;
  onOpenSchedule: () => MaybeAsync;
  onOpenPullRequests: (project: Project) => MaybeAsync;
  onOpenSettings: () => MaybeAsync;
  onOpenWorktree: (
    project: Project,
    worktreeGroup: ProjectWorktreeChatGroup,
  ) => MaybeAsync;
  onRetryWorktreeCreation: (chat: Chat) => MaybeAsync;
  onChatContextMenuAction: (chat: Chat, action: ChatContextMenuAction) => void;
  onProjectContextMenuAction: (
    project: Project,
    action: ProjectContextMenuAction,
  ) => void;
  onProjectPathLauncherAction: (
    project: Project,
    action: PathLauncherActionId,
  ) => void;
  onWorktreePathLauncherAction: (
    project: Project,
    worktreeGroup: ProjectWorktreeChatGroup,
    action: PathLauncherActionId,
  ) => void;
  onWorkspaceModeChange: (workspaceMode: WorkspaceMode) => void;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  pullRequestsActive: boolean;
  selectedChatId?: string;
  selectedProjectId?: string;
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
      className="
        hidden text-sidebar-foreground
        md:block
      "
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
            flex size-full flex-col rounded-lg bg-(--macos-sidebar-background)
            shadow-xl ring-1 ring-sidebar-border
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
  fleetActive,
  scheduleActive,
  isChatsLoading,
  isMacOS,
  isProjectsLoading,
  onArchiveChat,
  onCloneRepository,
  onCancelWorktreeCreation,
  onCreateProject,
  onCreateProjectChat,
  onCreateStandaloneChat,
  onImportSession,
  onOpenChat,
  onOpenFleet,
  onOpenSchedule,
  onOpenPullRequests,
  onOpenSettings,
  onOpenWorktree,
  onRetryWorktreeCreation,
  onChatContextMenuAction,
  onProjectContextMenuAction,
  onProjectPathLauncherAction,
  onWorktreePathLauncherAction,
  onWorkspaceModeChange,
  projectChatsByProjectId,
  projects,
  pullRequestsActive,
  selectedChatId,
  selectedProjectId,
}: WorkspaceSidebarProps): ReactElement {
  const { t } = useTranslation();
  const platform = window.desktopEnvironment.platform;
  const pullRequestsProject = is.nonEmptyString(selectedProjectId)
    ? projects.find((project) => project.id === selectedProjectId)
    : projects[0];
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const reserveNativeSidebarControlSpace =
    platform === "linux" || platform === "win32";
  const standaloneChats = chats.filter(
    (chat) => !is.nonEmptyString(chat.projectId),
  );
  const createChatFromNewButton = async () => {
    const target = resolveWorkspaceNewChatTarget({
      fleetActive: fleetActive || scheduleActive,
      projects,
      selectedChatId,
      selectedProjectId,
      workspaceMode,
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

        <WorkspaceModeControl
          onValueChange={onWorkspaceModeChange}
          value={workspaceMode}
        />
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
              isActive={scheduleActive}
              onClick={() => void onOpenSchedule()}
            >
              <CalendarDots weight="duotone" />
              <span>{t("schedule.title")}</span>
            </WorkspaceSidebarMenuButton>
          </AnimatedSidebarMenuItem>
          <AnimatedSidebarMenuItem>
            <WorkspaceSidebarMenuButton onClick={() => void onImportSession()}>
              <DownloadSimple weight="duotone" />
              <span>{t("sidebar.importSession")}</span>
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
          {pullRequestsProject ? (
            <AnimatedSidebarMenuItem>
              <WorkspaceSidebarMenuButton
                isActive={pullRequestsActive}
                onClick={() => void onOpenPullRequests(pullRequestsProject)}
              >
                <GitPullRequest weight="duotone" />
                <span>{t("pullRequests.title")}</span>
              </WorkspaceSidebarMenuButton>
            </AnimatedSidebarMenuItem>
          ) : null}
        </SidebarMenu>

        {workspaceMode === "chat" ? (
          <SimpleChatSidebarSection
            chats={standaloneChats}
            isLoading={isChatsLoading}
            onArchiveChat={onArchiveChat}
            onOpenChat={onOpenChat}
            onChatContextMenuAction={onChatContextMenuAction}
            selectedChatId={selectedChatId}
          />
        ) : null}

        {workspaceMode === "power" ? (
          <PowerProjectSidebarSection
            isLoading={isProjectsLoading}
            onCloneRepository={onCloneRepository}
            onCreateProject={onCreateProject}
            onCreateProjectChat={onCreateProjectChat}
            onCancelWorktreeCreation={onCancelWorktreeCreation}
            onOpenWorktree={onOpenWorktree}
            onOpenChat={onOpenChat}
            onRetryWorktreeCreation={onRetryWorktreeCreation}
            onProjectContextMenuAction={onProjectContextMenuAction}
            onProjectPathLauncherAction={onProjectPathLauncherAction}
            onWorktreePathLauncherAction={onWorktreePathLauncherAction}
            projectChatsByProjectId={projectChatsByProjectId}
            projects={projects}
          />
        ) : null}

        {workspaceMode === "work" ? (
          <ProjectSidebarSection
            isLoading={isProjectsLoading}
            onArchiveChat={onArchiveChat}
            onCloneRepository={onCloneRepository}
            onCancelWorktreeCreation={onCancelWorktreeCreation}
            onCreateProject={onCreateProject}
            onCreateProjectChat={onCreateProjectChat}
            onOpenChat={onOpenChat}
            onRetryWorktreeCreation={onRetryWorktreeCreation}
            onChatContextMenuAction={onChatContextMenuAction}
            onProjectContextMenuAction={onProjectContextMenuAction}
            onProjectPathLauncherAction={onProjectPathLauncherAction}
            projectChatsByProjectId={projectChatsByProjectId}
            projects={projects}
            selectedChatId={selectedChatId}
          />
        ) : null}
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
          grid grid-cols-3 gap-0.5 rounded-md bg-black/5.5 p-0.5
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
                  relative flex h-7 min-w-0 items-center justify-center gap-1.5
                  rounded-[5px] px-2
                  [font-size:var(--workspace-sidebar-label-text-size)]
                  font-medium text-sidebar-foreground/58 outline-hidden
                  focus-visible:text-sidebar-foreground
                `,
                isActive
                  ? "text-sidebar-foreground"
                  : `
                    hover:bg-white/25 hover:text-sidebar-foreground/78
                    focus-visible:bg-white/40
                    dark:hover:bg-white/5.5
                    dark:focus-visible:bg-white/10
                  `,
              )}
              key={option.value}
              onClick={() => onValueChange(option.value)}
              title={label}
              type="button"
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="
                    absolute inset-0 rounded-[5px] bg-white/58
                    shadow-[0_1px_2px_rgba(0,0,0,0.08)]
                    dark:bg-white/[0.14]
                    dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]
                  "
                />
              ) : null}
              <Icon className="relative size-4 shrink-0" weight="duotone" />
              <span className="relative min-w-0 truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
