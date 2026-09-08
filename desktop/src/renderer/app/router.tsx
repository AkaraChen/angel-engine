import type { RouteComponentProps } from "wouter";
import { Redirect, Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

import {
  WorkspaceChatPage,
  WorkspaceDraftPage,
} from "@/app/workspace/workspace-page";

export function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/">
          <WorkspaceDraftPage />
        </Route>
        <Route path="/fleet"><Redirect replace to="/" /></Route>
        <Route component={ChatRoutePage} path="/chat/:chatId" />
        <Route
          component={ProjectChatRoutePage}
          path="/project/:projectId/:chatId"
        />
        <Route path="/project/:projectId">
          <Redirect replace to="/" />
        </Route>
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

function ProjectChatRoutePage({
  params,
}: RouteComponentProps<{ chatId: string; projectId: string }>) {
  return (
    <WorkspaceChatPage chatId={params.chatId} projectId={params.projectId} />
  );
}
