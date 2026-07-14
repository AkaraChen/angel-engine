import type { PropsWithChildren } from "react";

import { ArrowLeft } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useRoute } from "wouter";

import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { WorkspacePanel } from "@/features/workspace/workspace-panel";
import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

/**
 * The chat header title: the conversation's own title, not the raw UUID. Falls
 * back to a generic "Chat" while the metadata loads or the daemon is unreachable.
 */
function useChatTitle(chatId: string | undefined): string {
  const { t } = useTranslation();
  const daemon = useDaemonClient();
  const query = useQuery({
    queryKey: queryKeys.chats.detail(chatId ?? ""),
    queryFn: async () => daemon.getChat(chatId ?? ""),
    enabled: chatId !== undefined && chatId.length > 0,
  });
  const title = query.data?.title.trim();
  return title !== undefined && title.length > 0
    ? title
    : t("shell.titleChatFallback");
}

function useRouteTitle(): string {
  const { t } = useTranslation();
  const [isSettings] = useRoute("/settings");
  const chatMatch = useRoute("/chat/:chatId");
  const chatId = chatMatch[0] ? chatMatch[1].chatId : undefined;
  const chatTitle = useChatTitle(chatId);
  if (isSettings) return t("common.settings");
  if (chatMatch[0]) return chatTitle;
  return t("shell.titleChats");
}

export function AppShell({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const [isChat, chatParams] = useRoute("/chat/:chatId");
  const title = useRouteTitle();
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0">
        <header
          className="
          flex h-12 shrink-0 items-center gap-2 px-2
        "
        >
          {isChat ? (
            <Button
              aria-label={t("shell.backToChats")}
              asChild
              size="icon"
              variant="ghost"
            >
              <Link href="/">
                <ArrowLeft size={18} />
              </Link>
            </Button>
          ) : (
            <SidebarTrigger />
          )}
          <h1 className="min-w-0 flex-1 truncate font-heading text-base font-semibold">
            {title}
          </h1>
          {isChat ? <WorkspacePanel chatId={chatParams.chatId} /> : null}
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
