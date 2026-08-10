import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { PathLauncherActionId } from "@shared/path-launcher";
import type { ReactElement } from "react";
import type { ProjectWorktreeChatGroup } from "@/features/chat/worktree-grouping";
import type { ProjectContextMenuAction } from "@/features/projects/api/queries";

import {
  CaretDown as ChevronDown,
  Folder,
  GitBranch,
  SpinnerGap as Loader2,
  Plus,
} from "@phosphor-icons/react";
import { AnimatePresence, m } from "framer-motion";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
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
import { PathLauncherContextMenu } from "@/features/path-launcher/components/path-launcher-context-menu";
import { AddProjectMenu } from "@/features/projects/components/add-project-menu";
import { ProjectContextMenu } from "@/features/projects/components/project-context-menu";
import { WorktreeCreationActions } from "@/features/projects/components/worktree-creation-actions";

type MaybeAsync = void | Promise<void>;

interface PowerProjectSidebarSectionProps {
  isLoading: boolean;
  onCloneRepository: () => MaybeAsync;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onCancelWorktreeCreation: (chat: Chat) => MaybeAsync;
  onOpenWorktree: (
    project: Project,
    worktreeGroup: ProjectWorktreeChatGroup,
  ) => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onRetryWorktreeCreation: (chat: Chat) => MaybeAsync;
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
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
}

export function PowerProjectSidebarSection({
  isLoading,
  onCloneRepository,
  onCreateProject,
  onCreateProjectChat,
  onCancelWorktreeCreation,
  onOpenWorktree,
  onOpenChat,
  onRetryWorktreeCreation,
  onProjectContextMenuAction,
  onProjectPathLauncherAction,
  onWorktreePathLauncherAction,
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
        <AddProjectMenu
          onChooseFolder={() => void onCreateProject()}
          onCloneRepository={() => void onCloneRepository()}
        />
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
              const worktreeCreationChats = projectChats.filter(
                (chat) => chat.worktreeCreation !== undefined,
              );
              const worktreeGroups = groupProjectChatsByWorktree(
                projectChats.filter(
                  (chat) => chat.worktreeCreation === undefined,
                ),
                project,
                t("sidebar.worktreeMain"),
              ).filter((group) => group.isMain || group.chats.length > 0);
              const singleWorktreeGroup =
                worktreeGroups.length === 1 ? worktreeGroups[0] : undefined;
              const isExpanded = expandedProjectIds.has(project.id);

              return (
                <AnimatedSidebarMenuItem key={project.id}>
                  <ProjectContextMenu
                    onAction={onProjectContextMenuAction}
                    onPathLauncherAction={onProjectPathLauncherAction}
                    project={project}
                  >
                    <WorkspaceSidebarMenuButton
                      aria-expanded={
                        singleWorktreeGroup === undefined
                          ? isExpanded
                          : undefined
                      }
                      onClick={() => {
                        if (singleWorktreeGroup !== undefined) {
                          void onOpenWorktree(project, singleWorktreeGroup);
                          return;
                        }

                        toggleProjectExpanded(project.id);
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
                  </ProjectContextMenu>
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
                          {worktreeCreationChats.map((chat) => {
                            const creation = chat.worktreeCreation;
                            if (!creation) return null;
                            const failed = creation.status === "failed";
                            return (
                              <AnimatedSidebarMenuItem key={chat.id}>
                                <div
                                  className="flex h-7 items-center gap-1.5 pr-1 pl-6 text-[11px]"
                                  title={creation.error}
                                >
                                  {failed ? (
                                    <GitBranch className="size-3 shrink-0 text-destructive" />
                                  ) : (
                                    <Loader2 className="size-3 shrink-0 animate-spin" />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-sidebar-foreground/65">
                                    {failed
                                      ? t("sidebar.worktreeCreationFailed")
                                      : t("sidebar.worktreeCreating", {
                                          progress: creation.progress,
                                        })}
                                  </span>
                                  <WorktreeCreationActions
                                    chat={chat}
                                    onCancel={onCancelWorktreeCreation}
                                    onOpenChat={onOpenChat}
                                    onRetry={onRetryWorktreeCreation}
                                    projectChats={projectChats}
                                  />
                                </div>
                              </AnimatedSidebarMenuItem>
                            );
                          })}
                          {worktreeGroups.map((group) => (
                            <AnimatedSidebarMenuItem key={group.key}>
                              <PathLauncherContextMenu
                                onSelect={(action) =>
                                  onWorktreePathLauncherAction(
                                    project,
                                    group,
                                    action,
                                  )
                                }
                              >
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
                              </PathLauncherContextMenu>
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
