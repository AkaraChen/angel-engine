import type { PropsWithChildren } from "react";

import { useRoute } from "wouter";

import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

function useRouteTitle(): string {
  const [isSettings] = useRoute("/settings");
  const chatMatch = useRoute("/chat/:chatId");
  if (isSettings) return "Settings";
  if (chatMatch[0]) return `Chat ${chatMatch[1].chatId}`;
  return "Chats";
}

export function AppShell({ children }: PropsWithChildren) {
  const title = useRouteTitle();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0">
        <header
          className="
          flex h-12 shrink-0 items-center gap-2 border-b border-border px-2
        "
        >
          <SidebarTrigger />
          <Separator className="mr-1" orientation="vertical" />
          <h1 className="font-heading text-base font-semibold">{title}</h1>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
