import type { FC } from "react";
import type { PowerWorktreeTabs } from "@/app/workspace/use-power-worktree-tabs";
import type { WorkspaceChatActions } from "@/app/workspace/use-workspace-chat-actions";
import type { WorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";
import type { WorktreeDraftGuard } from "@/app/workspace/use-worktree-draft-guard";

import is from "@sindresorhus/is";
import { Suspense, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { resolveWorkspacePathLauncherTarget } from "@/app/workspace/workspace-path-launcher";
import { WorkspaceRightSidebar } from "@/app/workspace/workspace-right-sidebar";
import {
  WorkspaceFloatingSidebar,
  WorkspaceSidebar,
} from "@/app/workspace/workspace-sidebar";
import {
  WorkspaceSidebarControl,
  WorkspaceSidebarControlPortalProvider,
} from "@/app/workspace/workspace-sidebar-control";
import { WorkspaceToolContextBridge } from "@/app/workspace/workspace-tool-host";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import { WorktreeDirtyDialog } from "@/app/workspace/worktree-dirty-dialog";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ImportSessionDialog } from "@/features/chat/components/import-session-dialog";
import { RenameChatDialog } from "@/features/chat/components/rename-chat-dialog";
import { WorkspaceCommandPalette } from "@/features/command-palette/workspace-command-palette";
import { FleetPage } from "@/features/fleet/fleet-page";
import { ProjectSettingsDialog } from "@/features/projects/components/project-settings-dialog";
import { queryKeys } from "@/platform/query-keys";

interface WorkspacePageViewProps {
  chatActions: WorkspaceChatActions;
  currentRoutePath: string;
  draftGuard: WorktreeDraftGuard;
  fleetActive: boolean;
  model: WorkspacePageModel;
  navigation: WorkspaceNavigation;
  powerTabs: PowerWorktreeTabs;
}

export const WorkspacePageView: FC<WorkspacePageViewProps> = ({
  chatActions,
  currentRoutePath,
  draftGuard,
  fleetActive,
  model,
  navigation,
  powerTabs,
}) => {
  const queryClient = useQueryClient();
  const [importSessionOpen, setImportSessionOpen] = useState(false);
  const openImportSession = useCallback(() => {
    setImportSessionOpen(true);
  }, []);
  const closeImportSession = useCallback(() => {
    setImportSessionOpen(false);
  }, []);

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
    powerDraftContext,
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
    setRightSidebarOpen,
    setRightSidebarWidth,
    setSidebarOpen,
    setSidebarOpenMobile,
    sidebarOpen,
    sidebarOpenMobile,
    t,
    toggleWorkspaceTools,
    workspaceMode,
    workspaceToolHost,
    workspaceToolContextKey,
    workspaceToolRoot,
    workspaceTitle,
    workspaceToolsToggleLabel,
  } = model;
  const {
    archiveChat,
    closeProjectSettingsDialog,
    closeRenameChatDialog,
    createProjectFromPicker,
    renameChat,
    renameChatPending,
    renameTargetChat,
    setChatMessagesInCache,
    setPersistedChatRuntime,
    settingsTargetProject,
    showChatContextMenu,
    showPathLauncherContextMenu,
    showProjectContextMenu,
    updateChatFromRun,
  } = chatActions;
  const openWorkspaceTerminal = useWorkspaceToolStore(
    (state) => state.openWorkspaceTerminal,
  );
  const {
    changeWorkspaceMode,
    createChatForProject,
    createChatForSelection,
    createStandaloneWorkspace,
    navigateToChat,
    navigateToDraft,
    openChat,
    openChatFromFleet,
    openFleet,
    openPowerWorktree,
    openSettings,
    selectDraftProject,
  } = navigation;
  const handleImportedSession = useCallback(
    async (chatId: string) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chats.list() });
      const chats = await queryClient.fetchQuery({
        queryFn: async () => api.chats.list(),
        queryKey: queryKeys.chats.list(),
      });
      const chat = chats.find((entry) => entry.id === chatId);
      if (chat) {
        navigateToChat(chat);
      }
    },
    [api, navigateToChat, queryClient],
  );
  const importCwd =
    selectedChat?.cwd ??
    pinnedDraftCwd ??
    powerDraftContext?.cwd ??
    powerHomePageContext?.cwd ??
    draftProject.path ??
    null;
  const {
    closeWorktreeDirtyPrompt,
    confirmProjectWorktreeCreation,
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
  const currentLauncherTarget = resolveWorkspacePathLauncherTarget({
    chats,
    draftProjectId: draftProject.id,
    projects,
    selectedChat,
    worktree: powerHomePageContext ?? powerDraftContext,
  });
  const canOpenAngelTerminal =
    canShowRightSidebar &&
    is.nonEmptyString(workspaceToolContextKey) &&
    is.nonEmptyString(workspaceToolRoot);
  const showCurrentWorkspaceContextMenu = async () => {
    if (currentLauncherTarget === undefined) return;

    const action = await showPathLauncherContextMenu(currentLauncherTarget, {
      includeAngelTerminal: canOpenAngelTerminal,
    });
    if (
      typeof action !== "object" ||
      action.action !== "open_angel_terminal" ||
      !is.nonEmptyString(workspaceToolContextKey)
    ) {
      return;
    }

    openWorkspaceTerminal({
      contextKey: workspaceToolContextKey,
      root: action.target,
    });
    if (workspaceToolHost === "sidebar") {
      setRightSidebarOpen(true);
    } else {
      toggleWorkspaceTools();
    }
  };
  const showWorktreeContextMenu = (
    project: (typeof projects)[number],
    worktree: Parameters<typeof navigation.openPowerWorktree>[1],
  ) => {
    const chatId = worktree.isMain ? undefined : worktree.chats[0]?.id;
    void showPathLauncherContextMenu({
      chatId,
      projectId: project.id,
    });
  };
  const cancelWorktreeCreation = async (chat: (typeof chats)[number]) => {
    await api.chats.cancelWorktreeCreation(chat.id);
    await queryClient.invalidateQueries({ queryKey: queryKeys.chats.list() });
    if (selectedChatId === chat.id) {
      navigation.navigateToDraft(chat.projectId ?? undefined, {
        replace: true,
      });
    }
  };
  const retryWorktreeCreation = async (chat: (typeof chats)[number]) => {
    if (!is.nonEmptyString(chat.projectId)) return;
    const approval = await confirmProjectWorktreeCreation(chat.projectId);
    if (!approval) return;
    await api.chats.retryWorktreeCreation(
      chat.id,
      typeof approval === "string" ? approval : undefined,
    );
    await queryClient.invalidateQueries({ queryKey: queryKeys.chats.list() });
  };

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
          fleetActive={fleetActive}
          isChatsLoading={chatsQuery.isPending}
          isMacOS={isMacOS}
          isProjectsLoading={projectsQuery.isPending}
          onArchiveChat={archiveChat}
          onCancelWorktreeCreation={cancelWorktreeCreation}
          onCreateProject={() => void createProjectFromPicker()}
          onCreateProjectChat={createChatForProject}
          onCreateStandaloneChat={createChatForSelection}
          onImportSession={openImportSession}
          onOpenChat={openChat}
          onOpenFleet={openFleet}
          onOpenSettings={openSettings}
          onOpenWorktree={openPowerWorktree}
          onRetryWorktreeCreation={retryWorktreeCreation}
          onShowChatContextMenu={showChatContextMenu}
          onShowProjectContextMenu={showProjectContextMenu}
          onShowWorktreeContextMenu={showWorktreeContextMenu}
          onWorkspaceModeChange={changeWorkspaceMode}
          projectChatsByProjectId={projectChatsByProjectId}
          projects={projects}
          selectedChatId={selectedChatId}
          selectedProjectId={selectedProjectId}
        />
        <WorkspaceFloatingSidebar
          chats={chats}
          fleetActive={fleetActive}
          isChatsLoading={chatsQuery.isPending}
          isMacOS={isMacOS}
          isProjectsLoading={projectsQuery.isPending}
          onArchiveChat={archiveChat}
          onCancelWorktreeCreation={cancelWorktreeCreation}
          onCreateProject={() => void createProjectFromPicker()}
          onCreateProjectChat={createChatForProject}
          onCreateStandaloneChat={createChatForSelection}
          onImportSession={openImportSession}
          onOpenChat={openChat}
          onOpenFleet={openFleet}
          onOpenSettings={openSettings}
          onOpenWorktree={openPowerWorktree}
          onRetryWorktreeCreation={retryWorktreeCreation}
          onShowChatContextMenu={showChatContextMenu}
          onShowProjectContextMenu={showProjectContextMenu}
          onShowWorktreeContextMenu={showWorktreeContextMenu}
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
        <WorkspaceCommandPalette
          chats={chats}
          onNewWorkspace={createStandaloneWorkspace}
          onOpenSession={openChatFromFleet}
          onOpenSettings={openSettings}
        />
        <RenameChatDialog
          chat={renameTargetChat}
          isSaving={renameChatPending}
          onClose={closeRenameChatDialog}
          onRename={renameChat}
        />
        <ImportSessionDialog
          api={api}
          cwd={importCwd}
          onClose={closeImportSession}
          onImported={handleImportedSession}
          open={importSessionOpen}
          projectId={selectedProjectId ?? draftProject.id ?? null}
          runtime={activeRuntime}
        />
        <ProjectSettingsDialog
          onClose={closeProjectSettingsDialog}
          project={settingsTargetProject}
        />
        <WorktreeDirtyDialog
          checked={rememberWorktreeDirtyChoice}
          onCheckedChange={setRememberWorktreeDirtyChoice}
          onClose={closeWorktreeDirtyPrompt}
          state={worktreeDirtyPrompt}
        />
        <WorkspaceToolContextBridge
          chatId={selectedChatId ?? null}
          contextKey={workspaceToolContextKey ?? null}
          root={workspaceToolRoot ?? null}
        />

        <SidebarInset className="h-svh min-w-0 max-h-svh overflow-hidden">
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
            title={fleetActive ? t("fleet.title") : workspaceTitle}
            onShowContextMenu={
              currentLauncherTarget === undefined
                ? undefined
                : () => void showCurrentWorkspaceContextMenu()
            }
            onToggleRightSidebar={
              canShowRightSidebar &&
              (!rightSidebarOpen || workspaceToolHost !== "sidebar")
                ? toggleWorkspaceTools
                : undefined
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
              {fleetActive ? (
                <FleetPage
                  chats={chats}
                  isMetadataError={chatsQuery.isError || projectsQuery.isError}
                  isMetadataPending={
                    chatsQuery.isPending || projectsQuery.isPending
                  }
                  onNewChat={openDraftTabFromTabBar}
                  onOpenChat={openChatFromFleet}
                  projects={projects}
                />
              ) : powerHomePageContext !== undefined ? (
                <PowerWorktreeHistoryPage
                  chats={chats}
                  groupKey={powerHomePageContext.groupKey}
                  label={t("sidebar.powerWorktreeHistoricalChat")}
                  onArchiveChat={(chat) => void archiveChat(chat)}
                  onNewChat={openDraftTabFromTabBar}
                  onOpenChat={openPowerHistoryChatTab}
                  onShowChatContextMenu={(chat) =>
                    void showChatContextMenu(chat)
                  }
                  projectPath={activePowerWorktreeProject?.path}
                />
              ) : is.nonEmptyString(selectedChatId) ? (
                selectedChatIsRunning && selectedChat ? (
                  <ActiveChatThread
                    draftAgentConfig={selectedChatAgentConfig}
                    onChatCreated={updateChatFromRun}
                    onChatMessagesUpdated={setChatMessagesInCache}
                    onChatUpdated={updateChatFromRun}
                    onSetupDiscarded={(projectId) =>
                      navigateToDraft(projectId, { replace: true })
                    }
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
                        onSetupDiscarded={(projectId) =>
                          navigateToDraft(projectId, { replace: true })
                        }
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
                  chats={chats}
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
                  onOpenChat={openChat}
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
          </main>
        </SidebarInset>
        {dockedWorkspaceToolContext ? (
          <WorkspaceRightSidebar
            active={workspaceToolHost === "sidebar"}
            api={api}
            contextKey={dockedWorkspaceToolContext.contextKey}
            open={rightSidebarOpen}
            root={dockedWorkspaceToolContext.root}
            width={rightSidebarWidth}
            onClose={toggleWorkspaceTools}
            onRequestHost={requestWorkspaceToolHost}
            onWidthChange={setRightSidebarWidth}
          />
        ) : null}
      </WorkspaceSidebarControlPortalProvider>
    </SidebarProvider>
  );
};
