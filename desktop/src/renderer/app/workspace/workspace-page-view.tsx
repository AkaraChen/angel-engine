import type { FC } from "react";
import type { PowerWorktreeTabs } from "@/app/workspace/use-power-worktree-tabs";
import type { WorkspaceChatActions } from "@/app/workspace/use-workspace-chat-actions";
import type { WorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";
import type { WorktreeDraftGuard } from "@/app/workspace/use-worktree-draft-guard";

import is from "@sindresorhus/is";
import { Suspense } from "react";
import { ChatRestoreLoading } from "@/app/workspace/chat-restore-loading";
import { DraftCreationLocationSelect } from "@/app/workspace/draft-project-select";
import { NewChatThread } from "@/app/workspace/new-chat-thread";
import { PowerWorktreeHistoryPage } from "@/app/workspace/power-worktree-history-page";
import { PowerWorktreeTabBar } from "@/app/workspace/power-worktree-tab-bar";
import {
  ActiveChatThread,
  ChatRestoreErrorBoundary,
  RestoredChatThread,
} from "@/app/workspace/workspace-chat-thread";
import { draftAgentConfigFromExplicitOverrides } from "@/app/workspace/workspace-draft-agent-config";
import { WorkspaceHeader } from "@/app/workspace/workspace-header";
import { WorkspaceNativeCommandHandler } from "@/app/workspace/workspace-native-command-handler";
import { WorkspaceRightSidebar } from "@/app/workspace/workspace-right-sidebar";
import {
  WorkspaceFloatingSidebar,
  WorkspaceSidebar,
} from "@/app/workspace/workspace-sidebar";
import {
  WorkspaceSidebarControl,
  WorkspaceSidebarControlPortalProvider,
} from "@/app/workspace/workspace-sidebar-control";
import {
  WorkspaceToolContextBridge,
  WorkspaceToolSurfaceHostControls,
} from "@/app/workspace/workspace-tool-host";
import { WorktreeDirtyDialog } from "@/app/workspace/worktree-dirty-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { RenameChatDialog } from "@/features/chat/components/rename-chat-dialog";

interface WorkspacePageViewProps {
  chatActions: WorkspaceChatActions;
  currentRoutePath: string;
  draftGuard: WorktreeDraftGuard;
  model: WorkspacePageModel;
  navigation: WorkspaceNavigation;
  powerTabs: PowerWorktreeTabs;
}

export const WorkspacePageView: FC<WorkspacePageViewProps> = ({
  chatActions,
  currentRoutePath,
  draftGuard,
  model,
  navigation,
  powerTabs,
}) => {
  const {
    activePowerWorktreeProject,
    activeRuntime,
    api,
    canCreateDraftWorktree,
    canShowRightSidebar,
    chatAttention,
    chatOptions,
    chats,
    chatsQuery,
    dockedWorkspaceToolContext,
    draftCreationLocation,
    draftProject,
    isMacOS,
    isProjectMode,
    modeOverride,
    modelOverride,
    permissionModeOverride,
    pinnedDraftCwd,
    powerDraftTabActive,
    powerHomePageContext,
    powerModeActive,
    projectChatsByProjectId,
    projects,
    projectsQuery,
    reasoningEffortOverride,
    requestWorkspaceToolHost,
    rightSidebarOpen,
    rightSidebarWidth,
    routeProjectId,
    runtimeConfig,
    runtimeOptions,
    runtimePageKey,
    selectedChat,
    selectedChatAgentConfig,
    selectedChatId,
    selectedChatIsRunning,
    selectedProjectId,
    selectedProjectName,
    setAgentModel,
    setAgentReasoningEffort,
    setRightSidebarWidth,
    setSidebarOpen,
    setSidebarOpenMobile,
    sidebarOpen,
    sidebarOpenMobile,
    t,
    toggleWorkspaceTools,
    workspaceMode,
    workspaceToolHost,
    workspaceToolRoot,
    workspaceTitle,
    workspaceToolsToggleLabel,
  } = model;
  const {
    archiveChat,
    closeRenameChatDialog,
    createProjectFromPicker,
    renameChat,
    renameChatPending,
    renameTargetChat,
    setChatMessagesInCache,
    setPersistedChatRuntime,
    showChatContextMenu,
    showProjectContextMenu,
    updateChatFromRun,
  } = chatActions;
  const {
    changeWorkspaceMode,
    createChatForProject,
    createChatForSelection,
    openChat,
    openPowerWorktree,
    openSettings,
    selectDraftProject,
  } = navigation;
  const {
    closeWorktreeDirtyPrompt,
    ensureDraftChatCanSubmit,
    rememberWorktreeDirtyChoice,
    setDraftCreationLocation,
    setRememberWorktreeDirtyChoice,
    worktreeDirtyPrompt,
  } = draftGuard;
  const {
    chatTabChats,
    closeChatTab,
    closeDraftTab,
    openDraftTabFromTabBar,
    openPowerHistoryChatTab,
    openSelectedPowerWorktreeHome,
    powerHomeTabContext,
  } = powerTabs;

  return (
    <SidebarProvider
      onOpenChange={setSidebarOpen}
      onOpenMobileChange={setSidebarOpenMobile}
      open={sidebarOpen}
      openMobile={sidebarOpenMobile}
    >
      <WorkspaceSidebarControlPortalProvider>
        <WorkspaceSidebar
          chats={chats}
          isChatsLoading={chatsQuery.isPending}
          isMacOS={isMacOS}
          isProjectsLoading={projectsQuery.isPending}
          onArchiveChat={archiveChat}
          onCreateProject={() => void createProjectFromPicker()}
          onCreateProjectChat={createChatForProject}
          onCreateStandaloneChat={createChatForSelection}
          onOpenChat={openChat}
          onOpenSettings={openSettings}
          onOpenWorktree={openPowerWorktree}
          onShowChatContextMenu={showChatContextMenu}
          onShowProjectContextMenu={showProjectContextMenu}
          onWorkspaceModeChange={changeWorkspaceMode}
          projectChatsByProjectId={projectChatsByProjectId}
          projects={projects}
          selectedChatId={selectedChatId}
          selectedProjectId={selectedProjectId}
        />
        <WorkspaceFloatingSidebar
          chats={chats}
          isChatsLoading={chatsQuery.isPending}
          isMacOS={isMacOS}
          isProjectsLoading={projectsQuery.isPending}
          onArchiveChat={archiveChat}
          onCreateProject={() => void createProjectFromPicker()}
          onCreateProjectChat={createChatForProject}
          onCreateStandaloneChat={createChatForSelection}
          onOpenChat={openChat}
          onOpenSettings={openSettings}
          onOpenWorktree={openPowerWorktree}
          onShowChatContextMenu={showChatContextMenu}
          onShowProjectContextMenu={showProjectContextMenu}
          onWorkspaceModeChange={changeWorkspaceMode}
          projectChatsByProjectId={projectChatsByProjectId}
          projects={projects}
          selectedChatId={selectedChatId}
          selectedProjectId={selectedProjectId}
        />
        <WorkspaceSidebarControl />
        <WorkspaceNativeCommandHandler
          onCreateStandaloneChat={createChatForSelection}
          onOpenSettings={openSettings}
        />
        <RenameChatDialog
          chat={renameTargetChat}
          isSaving={renameChatPending}
          onClose={closeRenameChatDialog}
          onRename={renameChat}
        />
        <WorktreeDirtyDialog
          checked={rememberWorktreeDirtyChoice}
          onCheckedChange={setRememberWorktreeDirtyChoice}
          onClose={closeWorktreeDirtyPrompt}
          state={worktreeDirtyPrompt}
        />
        <WorkspaceToolContextBridge
          chatId={selectedChatId ?? null}
          root={workspaceToolRoot ?? null}
        />

        <SidebarInset className="h-svh max-h-svh overflow-hidden">
          <WorkspaceHeader
            attention={chatAttention}
            breadcrumbProject={
              isProjectMode && selectedChat ? selectedProjectName : undefined
            }
            running={selectedChatIsRunning}
            rightSidebarOpen={
              canShowRightSidebar &&
              (rightSidebarOpen || workspaceToolHost !== "sidebar")
            }
            rightSidebarToggleLabel={workspaceToolsToggleLabel}
            title={workspaceTitle}
            workspaceToolActions={
              canShowRightSidebar && workspaceToolHost === "sidebar" ? (
                <WorkspaceToolSurfaceHostControls
                  host="sidebar"
                  onRequestHost={requestWorkspaceToolHost}
                />
              ) : undefined
            }
            onToggleRightSidebar={
              canShowRightSidebar ? toggleWorkspaceTools : undefined
            }
          />
          {powerModeActive && powerHomeTabContext !== undefined ? (
            <PowerWorktreeTabBar
              activeChatId={selectedChatId}
              chats={chatTabChats}
              draftTabActive={powerDraftTabActive}
              homeTabActive={powerHomePageContext !== undefined}
              onCloseChat={closeChatTab}
              onCloseDraftTab={closeDraftTab}
              onNewChat={openDraftTabFromTabBar}
              onOpenChat={openChat}
              onOpenHome={openSelectedPowerWorktreeHome}
            />
          ) : null}
          <main className="flex min-h-0 flex-1 overflow-hidden">
            <section
              className="flex min-h-0 min-w-0 flex-1 flex-col"
              data-workspace-mode={workspaceMode}
            >
              {powerHomePageContext !== undefined ? (
                <PowerWorktreeHistoryPage
                  chats={chats}
                  groupKey={powerHomePageContext.groupKey}
                  label={t("sidebar.powerWorktreeHistoricalChat")}
                  onArchiveChat={(chat) => void archiveChat(chat)}
                  onNewChat={openDraftTabFromTabBar}
                  onOpenChat={openPowerHistoryChatTab}
                  projectPath={activePowerWorktreeProject?.path}
                />
              ) : is.nonEmptyString(selectedChatId) ? (
                selectedChatIsRunning && selectedChat ? (
                  <ActiveChatThread
                    draftAgentConfig={selectedChatAgentConfig}
                    onChatCreated={updateChatFromRun}
                    onChatMessagesUpdated={setChatMessagesInCache}
                    onChatUpdated={updateChatFromRun}
                    projects={projects}
                    routeProjectId={routeProjectId}
                    runtimeOptions={runtimeOptions}
                    selectedChat={selectedChat}
                    setAgentModel={setAgentModel}
                    setAgentReasoningEffort={setAgentReasoningEffort}
                    setPersistedChatRuntime={setPersistedChatRuntime}
                  />
                ) : (
                  <ChatRestoreErrorBoundary key={selectedChatId}>
                    <Suspense fallback={<ChatRestoreLoading />}>
                      <RestoredChatThread
                        api={api}
                        currentRoutePath={currentRoutePath}
                        draftAgentConfig={selectedChatAgentConfig}
                        includeProjectInRoute={isProjectMode}
                        onChatCreated={updateChatFromRun}
                        onChatMessagesUpdated={setChatMessagesInCache}
                        onChatUpdated={updateChatFromRun}
                        projects={projects}
                        routeProjectId={routeProjectId}
                        runtimeOptions={runtimeOptions}
                        selectedChatId={selectedChatId}
                        setAgentModel={setAgentModel}
                        setAgentReasoningEffort={setAgentReasoningEffort}
                        setPersistedChatRuntime={setPersistedChatRuntime}
                      />
                    </Suspense>
                  </ChatRestoreErrorBoundary>
                )
              ) : (
                <NewChatThread
                  chatOptions={chatOptions}
                  creationLocation={draftCreationLocation}
                  cwd={pinnedDraftCwd}
                  creationLocationAccessory={
                    canCreateDraftWorktree ? (
                      <DraftCreationLocationSelect
                        onValueChange={setDraftCreationLocation}
                        value={draftCreationLocation}
                        variant="ghost"
                      />
                    ) : undefined
                  }
                  key={runtimePageKey}
                  model={modelOverride}
                  mode={modeOverride}
                  onBeforeSubmit={ensureDraftChatCanSubmit}
                  onChatCreated={updateChatFromRun}
                  onChatMessagesUpdated={setChatMessagesInCache}
                  onChatUpdated={updateChatFromRun}
                  onCreateProject={createProjectFromPicker}
                  onProjectChange={selectDraftProject}
                  permissionMode={permissionModeOverride}
                  prewarmId={
                    draftCreationLocation === "worktree"
                      ? undefined
                      : model.prewarmQuery.data?.prewarmId
                  }
                  projectId={draftProject.id}
                  projectName={selectedProjectName}
                  projectPath={draftProject.path}
                  projects={projects}
                  reasoningEffort={reasoningEffortOverride}
                  runOrigin={{
                    config: draftAgentConfigFromExplicitOverrides({
                      mode: modeOverride,
                      model: modelOverride,
                      permissionMode: permissionModeOverride,
                      reasoningEffort: reasoningEffortOverride,
                    }),
                    isDraft: true,
                    runtime: activeRuntime,
                    runtimePageKey,
                  }}
                  runtime={activeRuntime}
                  runtimeConfig={runtimeConfig}
                  slotKey={runtimePageKey}
                />
              )}
            </section>
            {dockedWorkspaceToolContext ? (
              <WorkspaceRightSidebar
                active={workspaceToolHost === "sidebar"}
                api={api}
                chatId={dockedWorkspaceToolContext.chatId}
                open={rightSidebarOpen}
                root={dockedWorkspaceToolContext.root}
                width={rightSidebarWidth}
                onWidthChange={setRightSidebarWidth}
              />
            ) : null}
          </main>
        </SidebarInset>
      </WorkspaceSidebarControlPortalProvider>
    </SidebarProvider>
  );
};
