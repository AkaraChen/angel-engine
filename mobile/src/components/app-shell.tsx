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
import { ChatActivityBadge } from "@/features/chat/chat-activity-badge";
import { useChatActivity } from "@/features/chat/use-activity";
import { WorkspacePanel } from "@/features/workspace/workspace-panel";
import { cn } from "@/lib/utils";
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
    queryFn: async () => daemon.chats.get(chatId ?? ""),
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
  const currentChatId = isChat ? chatParams.chatId : "";
  const activity = useChatActivity(currentChatId);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0">
        {/* The status bar sits above the header on a `viewport-fit=cover`
            page, so the safe-area inset is padding on the header rather than a
            spacer: the header ground extends under the notch. */}
        <header
          className="
            flex shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)]
          "
        >
          {isChat ? (
            <Button
              aria-label={t("shell.backToChats")}
              asChild
              className="size-11"
              size="icon"
              variant="ghost"
            >
              <Link href="/">
                <ArrowLeft size={20} />
              </Link>
            </Button>
          ) : (
            <SidebarTrigger className="size-11" />
          )}
          <h1
            className={cn(
              "my-2 min-w-0 flex-1 truncate font-heading tracking-tight",
              // The chat title shares its row with the activity badge and the
              // workspace trigger; only the list header gets the full scale.
              isChat ? "text-base font-medium" : "text-xl font-medium",
            )}
          >
            {title}
          </h1>
          {isChat && activity?.status === "waiting_for_you" ? (
            <ChatActivityBadge status={activity.status} />
          ) : null}
          {isChat ? <WorkspacePanel chatId={chatParams.chatId} /> : null}
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
