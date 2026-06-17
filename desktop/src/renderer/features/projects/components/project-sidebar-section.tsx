import type { Chat } from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ReactElement } from "react";
import {
  RiArrowDownSLine as ChevronDown,
  RiArrowRightSLine as ChevronRight,
  RiFolderLine as Folder,
  RiFolderAddLine as FolderPlus,
  RiLoader4Line as Loader2,
  RiAddLine as Plus,
} from "@remixicon/react";

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
      syncSidebarProjects(projectIds);
    }
  }, [isLoading, projectIds, syncSidebarProjects]);

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
                    <m.span
                      animate={{ rotate: isExpanded ? 0 : -90 }}
                      transition={sidebarMotion}
                    >
                      <ChevronDown />
                    </m.span>
                    <span
                      className="
                        block min-w-0 flex-1 truncate overflow-hidden text-left
                        whitespace-nowrap -ml-0.5
                      "
                      title={projectDisplayName}
                    >
                      {projectDisplayName}
                    </span>
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
