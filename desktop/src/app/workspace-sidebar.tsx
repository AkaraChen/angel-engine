import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { HTMLMotionProps, Transition } from "framer-motion";
import {
  ChevronRight,
  Folder,
  FolderPlus,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Settings,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useChatRunIsRunning } from "@/lib/chat-run-store";
import { cn } from "@/lib/utils";
import type { Chat } from "@/shared/chat";
import type { Project } from "@/shared/projects";

const primaryItems = [{ label: "New chat", icon: MessageSquarePlus }];

const sidebarMotion = {
  duration: 0.16,
  ease: "easeOut",
} satisfies Transition;

type MaybeAsync = void | Promise<void>;

export function WorkspaceSidebar({
  isChatsLoading,
  isMacOS,
  isProjectsLoading,
  onCreateProject,
  onCreateProjectChat,
  onCreateStandaloneChat,
  onOpenChat,
  onOpenSettings,
  onRefreshProjects,
  onShowChatContextMenu,
  onShowProjectContextMenu,
  projectChatsByProjectId,
  projects,
  selectedChatId,
  selectedProjectId,
  settingsActive,
  standaloneChats,
}: {
  isChatsLoading: boolean;
  isMacOS: boolean;
  isProjectsLoading: boolean;
  onCreateProject: () => MaybeAsync;
  onCreateProjectChat: (project: Project) => MaybeAsync;
  onCreateStandaloneChat: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onOpenSettings: () => MaybeAsync;
  onRefreshProjects: () => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  onShowProjectContextMenu: (project: Project) => MaybeAsync;
  projectChatsByProjectId: Map<string, Chat[]>;
  projects: Project[];
  selectedChatId?: string;
  selectedProjectId?: string;
  settingsActive: boolean;
  standaloneChats: Chat[];
}) {
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

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-2 pb-2 pt-2" data-electron-drag>
        {isMacOS ? <div aria-hidden className="h-8 shrink-0" /> : null}

        <SidebarMenu className="gap-1">
          {primaryItems.map(({ label, icon: Icon }) => (
            <AnimatedSidebarMenuItem key={label}>
              <MacSidebarMenuButton
                onClick={
                  label === "New chat"
                    ? () => void onCreateStandaloneChat()
                    : undefined
                }
              >
                <Icon />
                <span>{label}</span>
              </MacSidebarMenuButton>
            </AnimatedSidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1 pb-1">
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
              <Button
                asChild
                size="icon-xs"
                title="Add project"
                variant="ghost"
              >
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
                {isProjectsLoading ? (
                  <AnimatedSidebarMenuItem key="projects-loading">
                    <MacSidebarMenuButton disabled>
                      <Loader2 className="animate-spin" />
                      <span>Loading projects</span>
                    </MacSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ) : null}

                {!isProjectsLoading && projects.length === 0 ? (
                  <AnimatedSidebarMenuItem key="projects-empty">
                    <MacSidebarMenuButton disabled>
                      <Folder />
                      <span>No projects yet</span>
                    </MacSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ) : null}

                {projects.map((project) => {
                  const projectDisplayName = getProjectDisplayName(
                    project.path,
                  );
                  const projectChats =
                    projectChatsByProjectId.get(project.id) ?? [];
                  const isExpanded = expandedProjectIds.has(project.id);
                  const hasChats = projectChats.length > 0;

                  return (
                    <AnimatedSidebarMenuItem key={project.id}>
                      <MacSidebarMenuButton
                        aria-expanded={hasChats ? isExpanded : undefined}
                        isActive={project.id === selectedProjectId}
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
                        <span className="min-w-0 flex-1 truncate">
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
                            className="overflow-hidden"
                            exit={{ height: 0, opacity: 0 }}
                            initial={{ height: 0, opacity: 0 }}
                            key={`project-chats-${project.id}`}
                            transition={sidebarMotion}
                            layout="position"
                          >
                            <SidebarMenuSub>
                              {projectChats.map((chat) => (
                                <SidebarMenuSubItem key={chat.id}>
                                  <MacSidebarMenuSubButton
                                    isActive={chat.id === selectedChatId}
                                    onClick={() => void onOpenChat(chat)}
                                    onContextMenu={(event) => {
                                      event.preventDefault();
                                      void onShowChatContextMenu(chat);
                                    }}
                                    title={chat.cwd ?? chat.title}
                                  >
                                    <span className="min-w-0 flex-1 truncate">
                                      {chat.title}
                                    </span>
                                    <ChatRunningPulse chatId={chat.id} />
                                  </MacSidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
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

        <SidebarGroup className="py-1">
          <SidebarSectionHeader label="Chats" />
          <SidebarGroupContent>
            <SidebarMenu>
              <AnimatePresence initial={false}>
                {isChatsLoading ? (
                  <AnimatedSidebarMenuItem key="chats-loading">
                    <MacSidebarMenuButton disabled>
                      <Loader2 className="animate-spin" />
                      <span>Loading chats</span>
                    </MacSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ) : null}

                {!isChatsLoading && standaloneChats.length === 0 ? (
                  <AnimatedSidebarMenuItem key="chats-empty">
                    <MacSidebarMenuButton disabled>
                      <MessageSquare />
                      <span>No standalone chats</span>
                    </MacSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ) : null}

                {standaloneChats.map((chat) => (
                  <AnimatedSidebarMenuItem key={chat.id}>
                    <MacSidebarMenuButton
                      isActive={chat.id === selectedChatId}
                      onClick={() => void onOpenChat(chat)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        void onShowChatContextMenu(chat);
                      }}
                      title={chat.cwd ?? chat.title}
                    >
                      <MessageSquare />
                      <span className="min-w-0 flex-1 truncate">
                        {chat.title}
                      </span>
                      <ChatRunningPulse chatId={chat.id} />
                    </MacSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ))}
              </AnimatePresence>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <AnimatedSidebarMenuItem>
            <MacSidebarMenuButton
              isActive={settingsActive}
              onClick={() => void onOpenSettings()}
            >
              <Settings />
              <span>Settings</span>
            </MacSidebarMenuButton>
          </AnimatedSidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function ChatRunningPulse({ chatId }: { chatId: string }) {
  const isRunning = useChatRunIsRunning(chatId);
  if (!isRunning) return null;

  return (
    <i
      aria-hidden
      className="relative ml-auto flex size-2 shrink-0 rounded-full"
    >
      <i className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <i className="relative inline-flex size-2 rounded-full bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]" />
    </i>
  );
}

function AnimatedSidebarMenuItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.li
      animate="visible"
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      exit={{ opacity: 0 }}
      layout="position"
      transition={sidebarMotion}
    >
      {children}
    </motion.li>
  );
}

function SidebarSectionHeader({
  children,
  label,
}: {
  children?: ReactNode;
  label: string;
}) {
  return (
    <motion.div
      className="flex items-center justify-between gap-2 pr-2"
      layout
      transition={sidebarMotion}
    >
      <div className="flex min-w-0 items-center gap-1">
        <SidebarGroupLabel className="h-7">{label}</SidebarGroupLabel>
      </div>
      {children ? (
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
          {children}
        </div>
      ) : null}
    </motion.div>
  );
}

function MacSidebarMenuButton({
  children,
  className,
  isActive,
  type = "button",
  ...props
}: HTMLMotionProps<"button"> & { isActive?: boolean }) {
  return (
    <SidebarMenuButton asChild isActive={isActive}>
      <motion.button
        className={cn("relative", className)}
        transition={sidebarMotion}
        type={type}
        {...props}
      >
        {children}
      </motion.button>
    </SidebarMenuButton>
  );
}

function MacSidebarMenuSubButton({
  children,
  className,
  isActive,
  type = "button",
  ...props
}: HTMLMotionProps<"button"> & { isActive?: boolean }) {
  return (
    <SidebarMenuSubButton asChild isActive={isActive}>
      <motion.button
        className={cn("relative", className)}
        transition={sidebarMotion}
        type={type}
        {...props}
      >
        {children}
      </motion.button>
    </SidebarMenuSubButton>
  );
}

function MacSidebarMenuAction({
  children,
  className,
  showOnHover,
  type = "button",
  ...props
}: HTMLMotionProps<"button"> & { showOnHover?: boolean }) {
  return (
    <SidebarMenuAction asChild showOnHover={showOnHover}>
      <motion.button
        className={className}
        transition={sidebarMotion}
        type={type}
        whileTap={{ scale: 0.96 }}
        {...props}
      >
        {children}
      </motion.button>
    </SidebarMenuAction>
  );
}

function getProjectDisplayName(projectPath: string) {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}
