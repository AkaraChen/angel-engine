import type { FC } from "react";
import type { WorkspaceChatActions } from "@/app/workspace/use-workspace-chat-actions";
import type { WorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";

import { Suspense } from "react";
import { ChatRestoreLoading } from "@/app/workspace/chat-restore-loading";
import { NewChatThread } from "@/app/workspace/new-chat-thread";
import {
  ActiveChatThread,
  ChatRestoreErrorBoundary,
  RestoredChatThread,
} from "@/app/workspace/workspace-chat-thread";
import { draftAgentConfigFromExplicitOverrides } from "@/app/workspace/workspace-draft-agent-config";
import { WorkspaceHeader } from "@/app/workspace/workspace-header";
import { WorkspaceKeymapBindings } from "@/app/workspace/workspace-keymap-bindings";
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
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { RenameChatDialog } from "@/features/chat/components/rename-chat-dialog";
import { SessionHandoffDialog } from "@/features/chat/components/session-handoff-dialog";
import { WorkspaceCommandPalette } from "@/features/command-palette/workspace-command-palette";

interface WorkspacePageViewProps {
  chatActions: WorkspaceChatActions;
  currentRoutePath: string;
  model: WorkspacePageModel;
  navigation: WorkspaceNavigation;
}

export const WorkspacePageView: FC<WorkspacePageViewProps> = ({
  chatActions,
  currentRoutePath,
  model,
  navigation,
}) => {
  const {
    activeRuntime,
    api,
    canShowRightSidebar,
    chatAttention,
    chatOptions,
    chats,
    chatsQuery,
    dockedWorkspaceToolContext,
    draftProject,
    initialDraftPrompt,
    isMacOS,
    modeOverride,
    modelOverride,
    permissionModeOverride,
    pinnedDraftCwd,
    projects,
    reasoningEffortOverride,
    rightSidebarOpen,
    rightSidebarWidth,
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
    toggleWorkspaceTools,
    workspaceTitle,
    workspaceToolsToggleLabel,
  } = model;
  const {
    archiveChat,
    closeRenameChatDialog,
    closeSessionHandoffDialog,
    handoffTargetChat,
    renameChat,
    renameChatPending,
    renameTargetChat,
    setChatMessagesInCache,
    setPersistedChatRuntime,
    runChatContextMenuAction,
    updateChatFromRun,
  } = chatActions;
  const { createChatForSelection, openChat, openSettings } = navigation;
  const handleChatContextMenuAction = (
    chat: (typeof chats)[number],
    action: Parameters<typeof runChatContextMenuAction>[1],
  ) => void runChatContextMenuAction(chat, action);
  return (
    <SidebarProvider
      onOpenChange={setSidebarOpen}
      onOpenMobileChange={setSidebarOpenMobile}
      open={sidebarOpen}
      openMobile={sidebarOpenMobile}
    >
      <WorkspaceKeymapBindings
        onCreateStandaloneChat={createChatForSelection}
        onOpenSettings={openSettings}
      >
        <WorkspaceSidebarControlPortalProvider>
          <WorkspaceSidebar
            chats={chats}
            isChatsLoading={chatsQuery.isPending}
            isMacOS={isMacOS}
            onArchiveChat={archiveChat}
            onCreateStandaloneChat={createChatForSelection}
            onOpenChat={openChat}
            onOpenSettings={openSettings}
            onChatContextMenuAction={handleChatContextMenuAction}
            selectedChatId={selectedChatId}
          />
          <WorkspaceFloatingSidebar
            chats={chats}
            isChatsLoading={chatsQuery.isPending}
            isMacOS={isMacOS}
            onArchiveChat={archiveChat}
            onCreateStandaloneChat={createChatForSelection}
            onOpenChat={openChat}
            onOpenSettings={openSettings}
            onChatContextMenuAction={handleChatContextMenuAction}
            selectedChatId={selectedChatId}
          />
          <WorkspaceSidebarControl />
          <WorkspaceNativeCommandHandler
            onCreateStandaloneChat={createChatForSelection}
            onOpenSettings={openSettings}
          />
          <WorkspaceCommandPalette
            chats={chats}
            onImportSession={null}
            onNewWorkspace={createChatForSelection}
            onOpenSession={openChat}
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
          <SidebarInset className="h-svh min-w-0 max-h-svh overflow-hidden">
            <WorkspaceHeader
              attention={chatAttention}
              breadcrumbProject={
                selectedChat?.projectId ? selectedProjectName : undefined
              }
              running={selectedChatIsRunning}
              rightSidebarOpen={canShowRightSidebar && rightSidebarOpen}
              rightSidebarToggleLabel={workspaceToolsToggleLabel}
              title={workspaceTitle}
              onToggleRightSidebar={
                canShowRightSidebar ? toggleWorkspaceTools : undefined
              }
            />
            <main className="flex min-h-0 flex-1 overflow-hidden">
              <section className="flex min-h-0 min-w-0 flex-1 flex-col">
                {selectedChatId !== undefined && selectedChat ? (
                  selectedChatIsRunning ? (
                    <ActiveChatThread
                      draftAgentConfig={selectedChatAgentConfig}
                      onChatCreated={updateChatFromRun}
                      onForkChatCreated={(chat) => {
                        updateChatFromRun(chat);
                        openChat(chat);
                      }}
                      onChatMessagesUpdated={setChatMessagesInCache}
                      onChatUpdated={updateChatFromRun}
                      projects={projects}
                      routeProjectId={selectedProjectId}
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
                          includeProjectInRoute={true}
                          onChatCreated={updateChatFromRun}
                          onForkChatCreated={(chat) => {
                            updateChatFromRun(chat);
                            openChat(chat);
                          }}
                          onChatMessagesUpdated={setChatMessagesInCache}
                          onChatUpdated={updateChatFromRun}
                          projects={projects}
                          routeProjectId={selectedProjectId}
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
                    cwd={pinnedDraftCwd}
                    initialMarkdown={initialDraftPrompt}
                    model={modelOverride}
                    mode={modeOverride}
                    onChatCreated={updateChatFromRun}
                    onChatMessagesUpdated={setChatMessagesInCache}
                    onChatUpdated={updateChatFromRun}
                    onSelectFolder={model.selectDraftFolder}
                    onOpenChat={openChat}
                    permissionMode={permissionModeOverride}
                    prewarmId={
                      pinnedDraftCwd === undefined
                        ? model.prewarmQuery.data?.prewarmId
                        : undefined
                    }
                    projectId={draftProject.id}
                    projectName={selectedProjectName}
                    projectPath={pinnedDraftCwd ?? draftProject.path}
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
              active={true}
              api={api}
              contextKey={dockedWorkspaceToolContext.contextKey}
              open={rightSidebarOpen}
              root={dockedWorkspaceToolContext.root}
              width={rightSidebarWidth}
              onClose={toggleWorkspaceTools}
              onWidthChange={setRightSidebarWidth}
            />
          ) : null}
        </WorkspaceSidebarControlPortalProvider>
      </WorkspaceKeymapBindings>
    </SidebarProvider>
  );
};
