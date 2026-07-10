import is from "@sindresorhus/is";
import { WorkspacePageContent } from "@/app/workspace/workspace-page-content";
import {
  chatRoutePathId,
  projectChatRoutePath,
  projectDraftRoutePath,
} from "@/app/workspace/workspace-route-paths";
import { useApi } from "@/platform/use-api";

export function WorkspaceDraftPage({ projectId }: { projectId?: string }) {
  const api = useApi();

  return (
    <WorkspacePageContent
      api={api}
      currentRoutePath={
        is.nonEmptyString(projectId) ? projectDraftRoutePath(projectId) : "/"
      }
      draftProjectId={projectId}
    />
  );
}

export function WorkspaceChatPage({
  chatId,
  projectId,
}: {
  chatId: string;
  projectId?: string;
}) {
  const api = useApi();

  return (
    <WorkspacePageContent
      api={api}
      currentRoutePath={
        is.nonEmptyString(projectId)
          ? projectChatRoutePath(projectId, chatId)
          : chatRoutePathId(chatId)
      }
      routeProjectId={projectId}
      selectedChatId={chatId}
    />
  );
}
