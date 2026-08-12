import type { Project } from "@angel-engine/daemon-api/projects";
import type { PathLauncherActionId } from "@shared/path-launcher";
import type { FC } from "react";
import type { PowerWorktreeTabs } from "@/app/workspace/use-power-worktree-tabs";
import type { ImportSessionTarget } from "@/features/chat/components/import-session-dialog";
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
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import { PowerWorktreeHistoryPage } from "@/app/workspace/power-worktree-history-page";
import { PowerWorktreeTabBar } from "@/app/workspace/power-worktree-tab-bar";
import {
  ActiveChatThread,
  ChatRestoreErrorBoundary,
  RestoredChatThread,
} from "@/app/workspace/workspace-chat-thread";
import { draftAgentConfigFromExplicitOverrides } from "@/app/workspace/workspace-draft-agent-config";
import { WorkspaceHeader } from "@/app/workspace/workspace-header";
import { WorkspaceKeymapBindings } from "@/app/workspace/workspace-keymap-bindings";
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
import { WorktreeSetupGuidance } from "@/app/workspace/worktree-setup-guidance";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { ImportSessionDialog } from "@/features/chat/components/import-session-dialog";
import { RenameChatDialog } from "@/features/chat/components/rename-chat-dialog";
import { SessionHandoffDialog } from "@/features/chat/components/session-handoff-dialog";
import { WorkspaceCommandPalette } from "@/features/command-palette/workspace-command-palette";
import { FleetPage } from "@/features/fleet/fleet-page";
import { CloneProgressDialog } from "@/features/projects/components/clone-progress-dialog";
import { CloneRepositoryDialog } from "@/features/projects/components/clone-repository-dialog";
import { ProjectSettingsDialog } from "@/features/projects/components/project-settings-dialog";
import { SchedulePage } from "@/features/schedule/schedule-page";
import { queryKeys } from "@/platform/query-keys";

interface WorkspacePageViewProps {
  chatActions: WorkspaceChatActions;
  currentRoutePath: string;
  draftGuard: WorktreeDraftGuard;
  fleetActive: boolean;
  scheduleActive: boolean;
  model: WorkspacePageModel;
  navigation: WorkspaceNavigation;
  powerTabs: PowerWorktreeTabs;
}

export const WorkspacePageView: FC<WorkspacePageViewProps> = ({
  chatActions,
  currentRoutePath,
  draftGuard,
  fleetActive,
  scheduleActive,
  model,
  navigation,
  powerTabs,
}) => {
  const queryClient = useQueryClient();
  const [importTarget, setImportTarget] = useState<ImportSessionTarget | null>(
    null,
  );
  const closeImportSession = useCallback(() => {
    setImportTarget(null);
  }, []);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneUrl, setCloneUrl] = useState<string | null>(null);
  const openCloneDialog = useCallback(() => {
    setCloneDialogOpen(true);
  }, []);
  const startClone = useCallback((url: string) => {
    setCloneDialogOpen(false);
    setCloneUrl(url);
  }, []);
  const closeCloneProgress = useCallback(() => {
    setCloneUrl(null);
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
    initialDraftPrompt,
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
    closeSessionHandoffDialog,
    createProjectFromPicker,
    handoffTargetChat,
    renameChat,
    renameChatPending,
    renameTargetChat,
    setChatMessagesInCache,
    setPersistedChatRuntime,
    settingsTargetProject,
    runChatContextMenuAction,
    runPathLauncherAction,
    runProjectContextMenuAction,
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
    openSchedule,
    openPowerWorktree,
    openSettings,
    selectDraftProject,
  } = navigation;
  const handleImportedSession = useCallback(
    async (chatIds: string[]) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.chats.list() });
      const chats = await queryClient.fetchQuery({
        queryFn: async () => api.chats.list(),
        queryKey: queryKeys.chats.list(),
      });
      // A batch import lands the user on the first thread they picked; the rest
      // are already visible under the project in the sidebar.
      const firstId = chatIds[0];
      if (firstId === undefined) return;
      const chat = chats.find((entry) => entry.id === firstId);
      if (chat) {
        navigateToChat(chat);
      }
    },
    [api, navigateToChat, queryClient],
  );
  const openImportSessionForProject = useCallback((project: Project) => {
    setImportTarget({
      cwd: project.path,
      projectId: project.id,
      projectName: getProjectDisplayName(project.path),
    });
  }, []);
  // The palette entry only exists when a project owns the destination; with no
  // project in view there is nothing to import *into*, so it stays hidden
  // rather than opening a picker that has to ask.
  const paletteImportProject = projects.find(
    (project) => project.id === (selectedProjectId ?? draftProject.id),
  );
  const importSessionForCurrentProject =
    paletteImportProject === undefined
      ? null
      : () => openImportSessionForProject(paletteImportProject);
  const {
    closeWorktreeDirtyPrompt,
    configureSetupWithAgent,
    confirmProjectWorktreeCreation,
    dismissSetupGuidance,
    ensureDraftChatCanSubmit,
    migrateLegacyInitScript,
    rememberWorktreeDirtyChoice,
    setDraftCreationLocation,
    setRememberWorktreeDirtyChoice,
    setupGuidanceVisible,
    setupLegacyInitScript,
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
  const runCurrentWorkspacePathLauncherAction = async (
    action: PathLauncherActionId,
  ) => {
    if (currentLauncherTarget === undefined) return;

    const result = await runPathLauncherAction(currentLauncherTarget, action);
    if (
      typeof result !== "object" ||
      result.action !== "open_angel_terminal" ||
      !is.nonEmptyString(workspaceToolContextKey)
    ) {
      return;
    }

    openWorkspaceTerminal({
      contextKey: workspaceToolContextKey,
      root: result.target,
    });
    if (workspaceToolHost === "sidebar") {
      setRightSidebarOpen(true);
    } else {
      toggleWorkspaceTools();
    }
  };
  const handleChatContextMenuAction = (
    chat: (typeof chats)[number],
    action: Parameters<typeof runChatContextMenuAction>[1],
  ) => {
    void runChatContextMenuAction(chat, action);
  };
  const handleProjectContextMenuAction = (
    project: (typeof projects)[number],
    action: Parameters<typeof runProjectContextMenuAction>[1],
  ) => {
    void runProjectContextMenuAction(project, action);
  };
  const runProjectPathLauncherAction = (
    project: (typeof projects)[number],
    action: PathLauncherActionId,
  ) => {
    void runPathLauncherAction({ projectId: project.id }, action);
  };
  const runWorktreePathLauncherAction = (
    project: (typeof projects)[number],
    worktree: Parameters<typeof navigation.openPowerWorktree>[1],
    action: PathLauncherActionId,
  ) => {
    const chatId = worktree.isMain ? undefined : worktree.chats[0]?.id;
    void runPathLauncherAction({ chatId, projectId: project.id }, action);
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
      <WorkspaceKeymapBindings
        hasClosableTab={powerTabs.hasClosableTab}
        hasMultipleTabs={powerTabs.hasMultipleTabs}
        onCloseTab={powerTabs.closeActiveTab}
        onCreateStandaloneChat={createChatForSelection}
        onNewTab={powerTabs.openOrFocusDraftTab}
        onNextTab={powerTabs.goToNextTab}
        onOpenSettings={openSettings}
        onPreviousTab={powerTabs.goToPreviousTab}
        powerModeActive={powerTabs.powerModeActive}
      >
        <WorkspaceSidebarControlPortalProvider>
          <WorkspaceSidebar
            chats={chats}
            fleetActive={fleetActive}
            scheduleActive={scheduleActive}
            isChatsLoading={chatsQuery.isPending}
            isMacOS={isMacOS}
            isProjectsLoading={projectsQuery.isPending}
            onArchiveChat={archiveChat}
            onCloneRepository={openCloneDialog}
            onCancelWorktreeCreation={cancelWorktreeCreation}
            onCreateProject={() => void createProjectFromPicker()}
            onCreateProjectChat={createChatForProject}
            onCreateStandaloneChat={createChatForSelection}
            onImportSession={openImportSessionForProject}
            onOpenChat={openChat}
            onOpenFleet={openFleet}
            onOpenSchedule={openSchedule}
            onOpenSettings={openSettings}
            onOpenWorktree={openPowerWorktree}
            onRetryWorktreeCreation={retryWorktreeCreation}
            onChatContextMenuAction={handleChatContextMenuAction}
            onProjectContextMenuAction={handleProjectContextMenuAction}
            onProjectPathLauncherAction={runProjectPathLauncherAction}
            onWorktreePathLauncherAction={runWorktreePathLauncherAction}
            onWorkspaceModeChange={changeWorkspaceMode}
            projectChatsByProjectId={projectChatsByProjectId}
            projects={projects}
            selectedChatId={selectedChatId}
            selectedProjectId={selectedProjectId}
          />
          <WorkspaceFloatingSidebar
            chats={chats}
            fleetActive={fleetActive}
            scheduleActive={scheduleActive}
            isChatsLoading={chatsQuery.isPending}
            isMacOS={isMacOS}
            isProjectsLoading={projectsQuery.isPending}
            onArchiveChat={archiveChat}
            onCloneRepository={openCloneDialog}
            onCancelWorktreeCreation={cancelWorktreeCreation}
            onCreateProject={() => void createProjectFromPicker()}
            onCreateProjectChat={createChatForProject}
            onCreateStandaloneChat={createChatForSelection}
            onImportSession={openImportSessionForProject}
            onOpenChat={openChat}
            onOpenFleet={openFleet}
            onOpenSchedule={openSchedule}
            onOpenSettings={openSettings}
            onOpenWorktree={openPowerWorktree}
            onRetryWorktreeCreation={retryWorktreeCreation}
            onChatContextMenuAction={handleChatContextMenuAction}
            onProjectContextMenuAction={handleProjectContextMenuAction}
            onProjectPathLauncherAction={runProjectPathLauncherAction}
            onWorktreePathLauncherAction={runWorktreePathLauncherAction}
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
            onImportSession={importSessionForCurrentProject}
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
          <SessionHandoffDialog
            api={api}
            chat={handoffTargetChat}
            onClose={closeSessionHandoffDialog}
            runtimeOptions={runtimeOptions}
          />
          <ImportSessionDialog
            api={api}
            onClose={closeImportSession}
            onImported={handleImportedSession}
            runtimeOptions={runtimeOptions}
            target={importTarget}
          />
          <ProjectSettingsDialog
            onClose={closeProjectSettingsDialog}
            project={settingsTargetProject}
          />
          <CloneRepositoryDialog
            onClone={startClone}
            onOpenChange={setCloneDialogOpen}
            open={cloneDialogOpen}
          />
          <CloneProgressDialog
            onClose={closeCloneProgress}
            onOpenProject={(project) => {
              closeCloneProgress();
              createChatForProject(project);
            }}
            url={cloneUrl}
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
            projectId={
              selectedChat?.projectId ?? selectedProjectId ?? draftProject.id
            }
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
              title={
                scheduleActive
                  ? t("schedule.title")
                  : fleetActive
                    ? t("fleet.title")
                    : workspaceTitle
              }
              includeAngelTerminal={canOpenAngelTerminal}
              onPathLauncherAction={
                currentLauncherTarget === undefined
                  ? undefined
                  : (action) =>
                      void runCurrentWorkspacePathLauncherAction(action)
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
                {scheduleActive ? (
                  <SchedulePage projects={projects} />
                ) : fleetActive ? (
                  <FleetPage
                    chats={chats}
                    isMetadataError={
                      chatsQuery.isError || projectsQuery.isError
                    }
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
                    onChatContextMenuAction={handleChatContextMenuAction}
                    projectPath={activePowerWorktreeProject?.path}
                  />
                ) : is.nonEmptyString(selectedChatId) ? (
                  selectedChatIsRunning && selectedChat ? (
                    <ActiveChatThread
                      draftAgentConfig={selectedChatAgentConfig}
                      onChatCreated={updateChatFromRun}
                      onForkChatCreated={(chat) => {
                        updateChatFromRun(chat);
                        openChat(chat);
                      }}
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
                          onForkChatCreated={(chat) => {
                            updateChatFromRun(chat);
                            openChat(chat);
                          }}
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
                    initialMarkdown={initialDraftPrompt}
                    model={modelOverride}
                    mode={modeOverride}
                    notice={
                      setupGuidanceVisible ? (
                        <WorktreeSetupGuidance
                          hasLegacyInitScript={setupLegacyInitScript.length > 0}
                          onConfigure={configureSetupWithAgent}
                          onDismiss={dismissSetupGuidance}
                          onMigrate={() => void migrateLegacyInitScript()}
                        />
                      ) : undefined
                    }
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
      </WorkspaceKeymapBindings>
    </SidebarProvider>
  );
};
