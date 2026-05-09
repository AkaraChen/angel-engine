import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  Folder,
  FolderPlus,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import {
  AnimatedSidebarMenuItem,
  MacSidebarMenuAction,
  MacSidebarMenuButton,
  SidebarSectionHeader,
  sidebarMotion,
} from "@/components/workspace-sidebar-primitives";
import { ChatSidebarItem } from "@/features/chat/components/chat-sidebar-item";
import type { Chat } from "@/shared/chat";
import type { Project } from "@/shared/projects";

type MaybeAsync = void | Promise<void>;

type ProjectSidebarSectionProps = {
  isLoading: boolean;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onRefreshProjects: () => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  onShowProjectContextMenu: (project: Project) => MaybeAsync;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
};

export function ProjectSidebarSection({
  isLoading,
  onCreateProject,
  onCreateProjectChat,
  onOpenChat,
  onRefreshProjects,
  onShowChatContextMenu,
  onShowProjectContextMenu,
  projectChatsByProjectId,
  projects,
  selectedChatId,
  selectedProjectId,
}: ProjectSidebarSectionProps): ReactElement {
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(
    () => new Set(projects.map((project) => project.id)),
  );

  useEffect(() => {
    setExpandedProjectIds((current) => {
      let changed = false;
      const next = new Set(current);
      for (const project of projects) {
        if (!next.has(project.id)) {
          next.add(project.id);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [projects]);

  useEffect(() => {
    if (!selectedProjectId) return;
    setExpandedProjectIds((current) => {
      if (current.has(selectedProjectId)) return current;
      const next = new Set(current);
      next.add(selectedProjectId);
      return next;
    });
  }, [selectedProjectId]);

  function toggleProjectExpanded(projectId: string): void {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }

  return (
    <SidebarGroup className="py-1">
      <SidebarSectionHeader label="Projects">
        <>
          <Button
            asChild
            size="icon-xs"
            title="Refresh projects"
            variant="ghost"
          >
            <motion.button
              onClick={() => void onRefreshProjects()}
              title="Refresh projects"
              transition={sidebarMotion}
              type="button"
              whileTap={{ scale: 0.96 }}
            >
              <RefreshCw />
              <span className="sr-only">Refresh projects</span>
            </motion.button>
          </Button>
          <Button asChild size="icon-xs" title="Add project" variant="ghost">
            <motion.button
              onClick={() => void onCreateProject()}
              title="Add project"
              transition={sidebarMotion}
              type="button"
              whileTap={{ scale: 0.96 }}
            >
              <FolderPlus />
              <span className="sr-only">Add project</span>
            </motion.button>
          </Button>
        </>
      </SidebarSectionHeader>
      <SidebarGroupContent>
        <SidebarMenu>
          <AnimatePresence initial={false}>
            {isLoading ? (
              <AnimatedSidebarMenuItem key="projects-loading">
                <MacSidebarMenuButton disabled>
                  <Loader2 className="animate-spin" />
                  <span>Loading projects</span>
                </MacSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            ) : null}

            {!isLoading && projects.length === 0 ? (
              <AnimatedSidebarMenuItem key="projects-empty">
                <MacSidebarMenuButton disabled>
                  <Folder />
                  <span>No projects yet</span>
                </MacSidebarMenuButton>
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
                  <MacSidebarMenuButton
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
                      className="block min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap text-left"
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
                  </MacSidebarMenuButton>
                  <MacSidebarMenuAction
                    aria-label={`New chat in ${projectDisplayName}`}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void onCreateProjectChat(project);
                    }}
                    showOnHover
                    title={`New chat in ${projectDisplayName}`}
                    type="button"
                  >
                    <Plus />
                  </MacSidebarMenuAction>

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
                          {projectChats.map((chat) => (
                            <AnimatedSidebarMenuItem key={chat.id}>
                              <ChatSidebarItem
                                chatId={chat.id}
                                isActive={chat.id === selectedChatId}
                                onOpenChat={() => void onOpenChat(chat)}
                                onShowContextMenu={() =>
                                  onShowChatContextMenu(chat)
                                }
                                title={chat.title}
                                tooltip={chat.cwd ?? chat.title}
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

function getProjectDisplayName(projectPath: string): string {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}
