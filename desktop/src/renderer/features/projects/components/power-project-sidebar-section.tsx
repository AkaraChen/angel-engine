import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";
import type { ProjectWorktreeChatGroup } from "@/features/chat/worktree-grouping";

import {
  CaretDown as ChevronDown,
  Folder,
  FolderPlus,
  GitBranch,
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
import { groupProjectChatsByWorktree } from "@/features/chat/worktree-grouping";

type MaybeAsync = void | Promise<void>;

interface PowerProjectSidebarSectionProps {
  isLoading: boolean;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onOpenWorktree: (
    project: Project,
    worktreeGroup: ProjectWorktreeChatGroup,
  ) => MaybeAsync;
  onShowProjectContextMenu: (project: Project) => MaybeAsync;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
}

export function PowerProjectSidebarSection({
  isLoading,
  onCreateProject,
  onCreateProjectChat,
  onOpenWorktree,
  onShowProjectContextMenu,
  projectChatsByProjectId,
  projects,
}: PowerProjectSidebarSectionProps): ReactElement {
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
              const worktreeGroups = groupProjectChatsByWorktree(
                projectChats,
                project,
                t("sidebar.worktreeMain"),
              ).filter((group) => group.isMain || group.chats.length > 0);
              const singleWorktreeGroup =
                worktreeGroups.length === 1 ? worktreeGroups[0] : undefined;
              const isExpanded = expandedProjectIds.has(project.id);

              return (
                <AnimatedSidebarMenuItem key={project.id}>
                  <WorkspaceSidebarMenuButton
                    aria-expanded={
                      singleWorktreeGroup === undefined ? isExpanded : undefined
                    }
                    onClick={() => {
                      if (singleWorktreeGroup !== undefined) {
                        void onOpenWorktree(project, singleWorktreeGroup);
                        return;
                      }

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
                        block min-w-0 flex-1 truncate overflow-hidden text-left
                        whitespace-nowrap
                      "
                      title={projectDisplayName}
                    >
                      {projectDisplayName}
                    </span>
                    {singleWorktreeGroup === undefined ? (
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
                    ) : null}
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
                    {isExpanded && singleWorktreeGroup === undefined ? (
                      <m.div
                        animate={{ height: "auto", opacity: 1 }}
                        className="overflow-hidden py-0.5"
                        exit={{ height: 0, opacity: 0 }}
                        initial={{ height: 0, opacity: 0 }}
                        key={`project-worktrees-${project.id}`}
                        layout="position"
                        transition={sidebarMotion}
                      >
                        <SidebarMenu>
                          {worktreeGroups.map((group) => (
                            <AnimatedSidebarMenuItem key={group.key}>
                              <button
                                className="
                                  group/worktree-group flex h-6 w-full
                                  items-center gap-1.5 rounded-sm pr-2 pl-6
                                  text-left text-[11px] font-medium
                                  text-sidebar-foreground/50 outline-hidden
                                  hover:text-sidebar-foreground/75
                                  focus-visible:text-sidebar-foreground/75
                                "
                                onClick={() =>
                                  void onOpenWorktree(project, group)
                                }
                                title={group.cwd}
                                type="button"
                              >
                                <GitBranch className="size-3 shrink-0" />
                                <span className="min-w-0 truncate">
                                  {group.label}
                                </span>
                              </button>
                            </AnimatedSidebarMenuItem>
                          ))}
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
