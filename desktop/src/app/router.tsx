import { Redirect, Route, Router, Switch } from "wouter";
import type { RouteComponentProps } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

import {
  WorkspaceChatPage,
  WorkspaceDraftPage,
} from "@/app/workspace/workspace-page";
import { SettingsWindowPage } from "@/features/settings/settings-window-page";

export function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/">
          <WorkspaceDraftPage />
        </Route>
        <Route path="/settings">
          <SettingsWindowPage />
        </Route>
        <Route component={ChatRoutePage} path="/chat/:chatId" />
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

function ProjectChatRoutePage({
  params,
}: RouteComponentProps<{ chatId: string; projectId: string }>) {
  return (
    <WorkspaceChatPage chatId={params.chatId} projectId={params.projectId} />
  );
}
