import type { RouteComponentProps } from "wouter";
import { Redirect, Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

import {
  WorkspaceChatPage,
  WorkspaceDraftPage,
  WorkspaceFleetPage,
  WorkspacePullRequestsPage,
} from "@/app/workspace/workspace-page";
import { WorkspaceToolWindowPage } from "@/app/workspace/workspace-tool-host";

export function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/">
          <WorkspaceDraftPage />
        </Route>
        <Route path="/fleet">
          <WorkspaceFleetPage />
        </Route>
        <Route path="/workspace-tools">
          <WorkspaceToolWindowPage />
        </Route>
        <Route path="/workspace-tool/:toolId">
          <Redirect replace to="/workspace-tools" />
        </Route>
        <Route component={ChatRoutePage} path="/chat/:chatId" />
        <Route
          component={ProjectPullRequestsRoutePage}
          path="/project/:projectId/pulls"
        />
        <Route
          component={ProjectChatRoutePage}
          path="/project/:projectId/:chatId"
        />
        <Route component={ProjectDraftRoutePage} path="/project/:projectId" />
        <Route>
          <Redirect replace to="/" />
        </Route>
      </Switch>
    </Router>
  );
}

function ChatRoutePage({ params }: RouteComponentProps<{ chatId: string }>) {
  return <WorkspaceChatPage chatId={params.chatId} />;
}

function ProjectDraftRoutePage({
  params,
}: RouteComponentProps<{ projectId: string }>) {
  return <WorkspaceDraftPage projectId={params.projectId} />;
}

function ProjectPullRequestsRoutePage({
  params,
}: RouteComponentProps<{ projectId: string }>) {
  return <WorkspacePullRequestsPage projectId={params.projectId} />;
}

function ProjectChatRoutePage({
  params,
}: RouteComponentProps<{ chatId: string; projectId: string }>) {
  return (
    <WorkspaceChatPage chatId={params.chatId} projectId={params.projectId} />
  );
}
