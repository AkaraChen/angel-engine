import type { RouteComponentProps } from "wouter";

import { Redirect, Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

import { AppShell } from "@/components/app-shell";
import { ChatPage } from "@/pages/chat";
import { HomePage } from "@/pages/home";
import { SettingsPage } from "@/pages/settings";

export function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <AppShell>
        <Switch>
          <Route path="/">
            <HomePage />
          </Route>
          <Route component={ChatRoute} path="/chat/:chatId" />
          <Route path="/settings">
            <SettingsPage />
          </Route>
          <Route>
            <Redirect replace to="/" />
          </Route>
        </Switch>
      </AppShell>
    </Router>
  );
}

function ChatRoute({ params }: RouteComponentProps<{ chatId: string }>) {
  return <ChatPage chatId={params.chatId} />;
}
