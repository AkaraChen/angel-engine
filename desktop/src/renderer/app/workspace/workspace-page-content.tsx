import type { useApi } from "@/platform/use-api";

import { Redirect } from "wouter";
import { useWorkspaceChatActions } from "@/app/workspace/use-workspace-chat-actions";
import { useWorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";
import { useWorkspacePageModel } from "@/app/workspace/use-workspace-page-model";
import { WorkspacePageView } from "@/app/workspace/workspace-page-view";
import { chatRoutePath } from "@/app/workspace/workspace-route-paths";
import { resolveProjectDraftRedirect } from "@/app/workspace/workspace-project-route-normalization";

interface WorkspacePageContentProps {
  api: ReturnType<typeof useApi>;
  currentRoutePath: string;
  draftProjectId?: string;
  scheduleActive?: boolean;
  routeProjectId?: string;
  selectedChatId?: string;
}

export function WorkspacePageContent({
  api,
  currentRoutePath,
  draftProjectId,
  scheduleActive = false,
  routeProjectId,
  selectedChatId,
}: WorkspacePageContentProps) {
  const model = useWorkspacePageModel({
    api,
    draftProjectId,
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

  if (model.selectedChat) {
    const canonicalPath = chatRoutePath(model.selectedChat, {
      includeProject: model.isProjectMode,
    });
    if (canonicalPath !== currentRoutePath) {
      return <Redirect replace to={canonicalPath} />;
    }
  }

  const projectDraftRedirect = resolveProjectDraftRedirect({
    isDraftPage: model.isDraftPage,
    isProjectMode: model.isProjectMode,
    projects: model.projects,
    projectsQuerySucceeded: model.projectsQuery.isSuccess,
    requestedProjectId: draftProjectId,
    resolvedProjectId: model.draftProject.project?.id,
  });
  if (projectDraftRedirect !== undefined) {
    return <Redirect replace to={projectDraftRedirect.path} />;
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
      scheduleActive={scheduleActive}
      model={model}
      navigation={navigation}
    />
  );
}
