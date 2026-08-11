import type { useApi } from "@/platform/use-api";

import { Redirect } from "wouter";
import { usePowerWorktreeTabs } from "@/app/workspace/use-power-worktree-tabs";
import { useWorkspaceChatActions } from "@/app/workspace/use-workspace-chat-actions";
import { useWorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";
import { useWorkspacePageModel } from "@/app/workspace/use-workspace-page-model";
import { useWorktreeDraftGuard } from "@/app/workspace/use-worktree-draft-guard";
import { WorkspacePageView } from "@/app/workspace/workspace-page-view";
import { chatRoutePath } from "@/app/workspace/workspace-route-paths";

interface WorkspacePageContentProps {
  api: ReturnType<typeof useApi>;
  currentRoutePath: string;
  draftProjectId?: string;
  fleetActive?: boolean;
  scheduleActive?: boolean;
  routeProjectId?: string;
  selectedChatId?: string;
}

export function WorkspacePageContent({
  api,
  currentRoutePath,
  draftProjectId,
  fleetActive = false,
  scheduleActive = false,
  routeProjectId,
  selectedChatId,
}: WorkspacePageContentProps) {
  const model = useWorkspacePageModel({
    api,
    draftProjectId,
    fleetActive,
    scheduleActive,
    routeProjectId,
    selectedChatId,
  });
  const navigation = useWorkspaceNavigation(model);
  const chatActions = useWorkspaceChatActions({
    currentRoutePath,
    model,
    navigation,
  });
  const draftGuard = useWorktreeDraftGuard(model, navigation);
  const powerTabs = usePowerWorktreeTabs(model, navigation);

  if (model.selectedChat) {
    const canonicalPath = chatRoutePath(model.selectedChat, {
      includeProject: model.isProjectMode,
    });
    if (canonicalPath !== currentRoutePath) {
      return <Redirect replace to={canonicalPath} />;
    }
  }

  if (
    selectedChatId !== undefined &&
    model.chatsQuery.isSuccess &&
    !model.selectedChat &&
    !model.selectedChatIsRunning
  ) {
    return <Redirect replace to="/" />;
  }

  return (
    <WorkspacePageView
      chatActions={chatActions}
      currentRoutePath={currentRoutePath}
      draftGuard={draftGuard}
      fleetActive={fleetActive}
      scheduleActive={scheduleActive}
      model={model}
      navigation={navigation}
      powerTabs={powerTabs}
    />
  );
}
