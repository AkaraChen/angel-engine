import type { Chat } from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ReactElement } from "react";
import {
  CaretDown as ChevronDown,
  Folder,
  FolderPlus,
  SpinnerGap as Loader2,
  Plus,
} from "@phosphor-icons/react";

import { AnimatePresence, m } from "framer-motion";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { sidebarMotion } from "@/components/workspace-sidebar-motion";
import {
  AnimatedSidebarMenuItem,
  SidebarSectionHeader,
  WorkspaceSidebarMenuAction,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import { ChatSidebarItem } from "@/features/chat/components/chat-sidebar-item";

type MaybeAsync = void | Promise<void>;

interface ProjectSidebarSectionProps {
  isLoading: boolean;
  onArchiveChat: (chat: Chat) => MaybeAsync;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  onShowProjectContextMenu: (project: Project) => MaybeAsync;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  selectedChatId?: string;
}

export function ProjectSidebarSection({
  isLoading,
  onArchiveChat,
  onCreateProject,
  onCreateProjectChat,
  onOpenChat,
  onShowChatContextMenu,
  onShowProjectContextMenu,
  projectChatsByProjectId,
  projects,
  selectedChatId,
}: ProjectSidebarSectionProps): ReactElement {
  const { t } = useTranslation();
  const projectIds = useMemo(
    () => projects.map((project) => project.id),
    [projects],
  );
  const projectIdsWithChats = useMemo(
    () =>
      projects
        .filter(
          (project) =>
            (projectChatsByProjectId.get(project.id)?.length ?? 0) > 0,
        )
        .map((project) => project.id),
    [projectChatsByProjectId, projects],
  );
  const expandedProjectIds = useWorkspaceUiStore(
    (state) => state.expandedProjectIds,
  );
  const syncSidebarProjects = useWorkspaceUiStore(
    (state) => state.syncSidebarProjects,
  );
  const toggleProjectExpanded = useWorkspaceUiStore(
    (state) => state.toggleSidebarProject,
  );

  useEffect(() => {
    if (!isLoading) {
      syncSidebarProjects(projectIds, projectIdsWithChats);
    }
  }, [isLoading, projectIds, projectIdsWithChats, syncSidebarProjects]);

  return (
    <SidebarGroup className="py-1">
      <SidebarSectionHeader label={t("sidebar.projects")}>
        <Button
          asChild
          className="
            size-7
            [&_svg:not([class*='size-'])]:size-4
          "
          size="icon-xs"
          title={t("sidebar.addProject")}
          variant="ghost"
        >
          <m.button
            onClick={() => void onCreateProject()}
            title={t("sidebar.addProject")}
            transition={sidebarMotion}
            type="button"
            whileTap={{ scale: 0.96 }}
          >
            <FolderPlus />
            <span className="sr-only">{t("sidebar.addProject")}</span>
          </m.button>
        </Button>
      </SidebarSectionHeader>
      <SidebarGroupContent>
        <SidebarMenu>
          <AnimatePresence initial={false}>
            {isLoading ? (
              <AnimatedSidebarMenuItem key="projects-loading">
                <WorkspaceSidebarMenuButton disabled>
                  <Loader2 className="animate-spin" />
                  <span>{t("sidebar.loadingProjects")}</span>
                </WorkspaceSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            ) : null}

            {!isLoading && projects.length === 0 ? (
              <AnimatedSidebarMenuItem key="projects-empty">
                <WorkspaceSidebarMenuButton disabled>
                  <Folder />
                  <span>{t("sidebar.noProjects")}</span>
                </WorkspaceSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            ) : null}

            {projects.map((project) => {
              const projectDisplayName = getProjectDisplayName(project.path);
              const projectChats =
                projectChatsByProjectId.get(project.id) ?? [];
              const isExpanded = expandedProjectIds.has(project.id);
              const hasChats = projectChats.length > 0;

              return (
                <AnimatedSidebarMenuItem key={project.id}>
                  <WorkspaceSidebarMenuButton
                    aria-expanded={isExpanded}
                    onClick={() => {
                      toggleProjectExpanded(project.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void onShowProjectContextMenu(project);
                    }}
                    title={project.path}
                  >
                    <span
                      className="
                        block min-w-0 truncate overflow-hidden text-left
                        whitespace-nowrap
                      "
                      title={projectDisplayName}
                    >
                      {projectDisplayName}
                    </span>
                    <m.span
                      animate={{ rotate: isExpanded ? 0 : -90 }}
                      aria-hidden="true"
                      className="
                        ml-1 flex size-4 shrink-0 items-center justify-center
                        opacity-0 transition-opacity
                        group-focus-within/menu-item:opacity-70
                        group-hover/menu-item:opacity-70
                        group-data-[collapsible=icon]:hidden
                      "
                      transition={sidebarMotion}
                    >
                      <ChevronDown />
                    </m.span>
                  </WorkspaceSidebarMenuButton>
                  <WorkspaceSidebarMenuAction
                    aria-label={t("sidebar.newChatInProject", {
                      projectName: projectDisplayName,
                    })}
                    className="[&_svg]:size-4"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void onCreateProjectChat(project);
                    }}
                    title={t("sidebar.newChatInProject", {
                      projectName: projectDisplayName,
                    })}
                    type="button"
                  >
                    <Plus />
                  </WorkspaceSidebarMenuAction>

                  <AnimatePresence initial={false}>
                    {isExpanded ? (
                      <m.div
                        animate={{ height: "auto", opacity: 1 }}
                        className="overflow-hidden py-0.5"
                        exit={{ height: 0, opacity: 0 }}
                        initial={{ height: 0, opacity: 0 }}
                        key={`project-chats-${project.id}`}
                        transition={sidebarMotion}
                        layout="position"
                      >
                        <SidebarMenu>
                          {hasChats ? (
                            projectChats.map((chat) => (
                              <AnimatedSidebarMenuItem key={chat.id}>
                                <ChatSidebarItem
                                  chatId={chat.id}
                                  isActive={chat.id === selectedChatId}
                                  nested
                                  onArchiveChat={async () =>
                                    onArchiveChat(chat)
                                  }
                                  onOpenChat={() => void onOpenChat(chat)}
                                  onShowContextMenu={async () =>
                                    onShowChatContextMenu(chat)
                                  }
                                  runtime={chat.runtime}
                                  title={displayChatTitle(chat.title, t)}
                                  tooltip={
                                    chat.cwd ?? displayChatTitle(chat.title, t)
                                  }
                                />
                              </AnimatedSidebarMenuItem>
                            ))
                          ) : (
                            <AnimatedSidebarMenuItem key="no-chats">
                              <WorkspaceSidebarMenuButton
                                className="text-sidebar-foreground/45"
                                disabled
                              >
                                <span>{t("sidebar.noChats")}</span>
                              </WorkspaceSidebarMenuButton>
                            </AnimatedSidebarMenuItem>
                          )}
                        </SidebarMenu>
                      </m.div>
                    ) : null}
                  </AnimatePresence>
                </AnimatedSidebarMenuItem>
              );
            })}
          </AnimatePresence>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function getProjectDisplayName(projectPath: string): string {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

function displayChatTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return title === "New chat" ? t("workspace.newChat") : title;
}
