import { Redirect, Route, Router, Switch } from 'wouter';
import type { RouteComponentProps } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';

import { WorkspacePage, type WorkspaceRoute } from '@/pages/workspace-page';

export function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/">
          <WorkspacePage route={{ type: 'create' }} />
        </Route>
        <Route path="/settings">
          <WorkspacePage route={{ type: 'settings' }} />
        </Route>
        <Route component={ChatRoutePage} path="/chat/:chatId" />
        <Route
          component={ProjectChatRoutePage}
          path="/project/:projectId/:chatId"
        />
        <Route>
          <Redirect replace to="/" />
        </Route>
      </Switch>
    </Router>
  );
}

function ChatRoutePage({
  params,
}: RouteComponentProps<{ chatId: string }>) {
  return <WorkspacePage route={chatRoute(params.chatId)} />;
}

function ProjectChatRoutePage({
  params,
}: RouteComponentProps<{ chatId: string; projectId: string }>) {
  return (
    <WorkspacePage
      route={projectChatRoute(params.projectId, params.chatId)}
    />
  );
}

function chatRoute(chatId: string): WorkspaceRoute {
  return { chatId, type: 'chat' };
}

function projectChatRoute(projectId: string, chatId: string): WorkspaceRoute {
  return { chatId, projectId, type: 'projectChat' };
}
