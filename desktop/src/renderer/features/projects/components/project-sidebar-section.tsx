import type { Chat } from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ReactElement } from "react";
import {
  RiArrowRightSLine as ChevronRight,
  RiFolderLine as Folder,
  RiFolderAddLine as FolderPlus,
  RiLoader4Line as Loader2,
  RiAddLine as Plus,
} from "@remixicon/react";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import {
  AnimatedSidebarMenuItem,
  sidebarMotion,
  SidebarSectionHeader,
  WorkspaceSidebarMenuAction,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import { ChatSidebarItem } from "@/features/chat/components/chat-sidebar-item";

type MaybeAsync = void | Promise<void>;

interface ProjectExpansionState {
  expandedProjectIds: Set<string>;
  projectIds: Set<string>;
  selectedProjectId?: string;
}

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
  selectedProjectId?: string;
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
  selectedProjectId,
}: ProjectSidebarSectionProps): ReactElement {
  const { t } = useTranslation();
  const currentProjectIds = new Set(projects.map((project) => project.id));
  const [projectExpansion, setProjectExpansion] =
    useState<ProjectExpansionState>(() => ({
      expandedProjectIds: new Set(projects.map((project) => project.id)),
      projectIds: currentProjectIds,
      selectedProjectId,
    }));

  let expandedProjectIds = projectExpansion.expandedProjectIds;
  if (
    !setsEqual(projectExpansion.projectIds, currentProjectIds) ||
    projectExpansion.selectedProjectId !== selectedProjectId
  ) {
    const nextExpandedProjectIds = new Set(expandedProjectIds);
    for (const projectId of nextExpandedProjectIds) {
      if (!currentProjectIds.has(projectId)) {
        nextExpandedProjectIds.delete(projectId);
      }
    }
    for (const projectId of currentProjectIds) {
      if (!projectExpansion.projectIds.has(projectId)) {
        nextExpandedProjectIds.add(projectId);
      }
    }
    if (selectedProjectId) {
      nextExpandedProjectIds.add(selectedProjectId);
    }
    setProjectExpansion({
      expandedProjectIds: nextExpandedProjectIds,
      projectIds: currentProjectIds,
      selectedProjectId,
    });
    expandedProjectIds = nextExpandedProjectIds;
  }

  function toggleProjectExpanded(projectId: string): void {
    setProjectExpansion((current) => {
      const expandedProjectIds = new Set(current.expandedProjectIds);
      if (expandedProjectIds.has(projectId)) {
        expandedProjectIds.delete(projectId);
      } else {
        expandedProjectIds.add(projectId);
      }
      return { ...current, expandedProjectIds };
    });
  }

  return (
    <SidebarGroup className="py-1">
      <SidebarSectionHeader label={t("sidebar.projects")}>
        <Button
          asChild
          size="icon-xs"
          title={t("sidebar.addProject")}
          variant="ghost"
        >
          <motion.button
            onClick={() => void onCreateProject()}
            title={t("sidebar.addProject")}
            transition={sidebarMotion}
            type="button"
            whileTap={{ scale: 0.96 }}
          >
            <FolderPlus />
            <span className="sr-only">{t("sidebar.addProject")}</span>
          </motion.button>
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
              const projectChats = projectChatsByProjectId.get(project.id);
              const isExpanded = expandedProjectIds.has(project.id);
              const hasChats = Boolean(projectChats?.length);

              return (
                <AnimatedSidebarMenuItem key={project.id}>
                  <WorkspaceSidebarMenuButton
                    aria-expanded={hasChats ? isExpanded : undefined}
                    onClick={() => {
                      toggleProjectExpanded(project.id);
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      void onShowProjectContextMenu(project);
                    }}
                    title={project.path}
                  >
                    <Folder />
                    <span
                      className="
                        block min-w-0 flex-1 truncate overflow-hidden text-left
                        whitespace-nowrap
                      "
                      title={projectDisplayName}
                    >
                      {projectDisplayName}
                    </span>
                    {hasChats ? (
                      <motion.span
                        animate={{ rotate: isExpanded ? 90 : 0 }}
                        className="ml-1 shrink-0 opacity-80"
                        transition={sidebarMotion}
                      >
                        <ChevronRight className="size-4" />
                      </motion.span>
                    ) : null}
                  </WorkspaceSidebarMenuButton>
                  <WorkspaceSidebarMenuAction
                    aria-label={t("sidebar.newChatInProject", {
                      projectName: projectDisplayName,
                    })}
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
                    {hasChats && isExpanded ? (
                      <motion.div
                        animate={{ height: "auto", opacity: 1 }}
                        className="overflow-hidden py-0.5"
                        exit={{ height: 0, opacity: 0 }}
                        initial={{ height: 0, opacity: 0 }}
                        key={`project-chats-${project.id}`}
                        transition={sidebarMotion}
                        layout="position"
                      >
                        <SidebarMenu>
                          {projectChats?.map((chat) => (
                            <AnimatedSidebarMenuItem key={chat.id}>
                              <ChatSidebarItem
                                chatId={chat.id}
                                isActive={chat.id === selectedChatId}
                                onArchiveChat={async () => onArchiveChat(chat)}
                                onOpenChat={() => void onOpenChat(chat)}
                                onShowContextMenu={async () =>
                                  onShowChatContextMenu(chat)
                                }
                                title={displayChatTitle(chat.title, t)}
                                tooltip={
                                  chat.cwd ?? displayChatTitle(chat.title, t)
                                }
                              />
                            </AnimatedSidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </motion.div>
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

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
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
