import type { Chat } from "@shared/chat";
import type { ReactElement } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2, MessageSquare } from "lucide-react";
import { useMemo } from "react";

import { useTranslation } from "react-i18next";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import {
  AnimatedSidebarMenuItem,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import { ChatSidebarItem } from "@/features/chat/components/chat-sidebar-item";

type MaybeAsync = void | Promise<void>;
type ChatDateGroupKey =
  | "dayBeforeYesterday"
  | "older"
  | "previousMonth"
  | "previousWeek"
  | "today"
  | "yesterday";

interface ChatDateGroup {
  chats: Chat[];
  key: ChatDateGroupKey;
  labelKey: string;
}

interface SimpleChatSidebarSectionProps {
  chats: Chat[];
  isLoading: boolean;
  onArchiveChat: (chat: Chat) => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  selectedChatId?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const CHAT_DATE_GROUPS: Array<{
  key: ChatDateGroupKey;
  labelKey: string;
}> = [
  { key: "today", labelKey: "sidebar.dateGroups.today" },
  { key: "yesterday", labelKey: "sidebar.dateGroups.yesterday" },
  {
    key: "dayBeforeYesterday",
    labelKey: "sidebar.dateGroups.dayBeforeYesterday",
  },
  { key: "previousWeek", labelKey: "sidebar.dateGroups.previousWeek" },
  { key: "previousMonth", labelKey: "sidebar.dateGroups.previousMonth" },
  { key: "older", labelKey: "sidebar.dateGroups.older" },
];

export function SimpleChatSidebarSection({
  chats,
  isLoading,
  onArchiveChat,
  onOpenChat,
  onShowChatContextMenu,
  selectedChatId,
}: SimpleChatSidebarSectionProps): ReactElement {
  const { t } = useTranslation();
  const groupedChats = useMemo(() => groupChatsByUpdatedAt(chats), [chats]);

  return (
    <SidebarGroup className="py-1">
      <SidebarGroupContent className="space-y-1">
        <AnimatePresence initial={false}>
          {isLoading ? (
            <SidebarMenu key="chats-loading-menu">
              <AnimatedSidebarMenuItem key="chats-loading">
                <WorkspaceSidebarMenuButton disabled>
                  <Loader2 className="animate-spin" />
                  <span>{t("sidebar.loadingChats")}</span>
                </WorkspaceSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            </SidebarMenu>
          ) : null}

          {!isLoading && chats.length === 0 ? (
            <div
              className="
                flex min-h-44 flex-col items-center justify-center gap-3 px-4
                py-8 text-center text-sidebar-foreground/70
              "
              key="chats-empty"
            >
              <MessageSquare className="size-6 text-sidebar-foreground/45" />
              <span className="text-xs font-medium">
                {t("sidebar.noChats")}
              </span>
            </div>
          ) : null}

          {!isLoading
            ? groupedChats.map((group) => (
                <div className="space-y-0.5" key={group.key}>
                  <SidebarGroupLabel className="h-7">
                    {t(group.labelKey)}
                  </SidebarGroupLabel>
                  <SidebarMenu>
                    {group.chats.map((chat) => (
                      <AnimatedSidebarMenuItem key={chat.id}>
                        <ChatSidebarItem
                          chatId={chat.id}
                          isActive={chat.id === selectedChatId}
                          onArchiveChat={async () => onArchiveChat(chat)}
                          onOpenChat={() => void onOpenChat(chat)}
                          onShowContextMenu={async () =>
                            onShowChatContextMenu(chat)
                          }
                          title={displayChatTitle(chat.title, t)}
                          tooltip={chat.cwd ?? displayChatTitle(chat.title, t)}
                        />
                      </AnimatedSidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </div>
              ))
            : null}
        </AnimatePresence>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function groupChatsByUpdatedAt(chats: Chat[]): ChatDateGroup[] {
  const todayStart = startOfLocalDay(new Date());
  const buckets = new Map<ChatDateGroupKey, Chat[]>(
    CHAT_DATE_GROUPS.map((group) => [group.key, []]),
  );

  for (const chat of [...chats].sort(compareChatsByUpdatedAtDesc)) {
    const groupKey = chatDateGroupKey(chat, todayStart);
    buckets.get(groupKey)?.push(chat);
  }

  return CHAT_DATE_GROUPS.flatMap((group) => {
    const groupChats = buckets.get(group.key) ?? [];
    if (groupChats.length === 0) return [];
    return [{ chats: groupChats, key: group.key, labelKey: group.labelKey }];
  });
}

function compareChatsByUpdatedAtDesc(left: Chat, right: Chat): number {
  return chatTimestamp(right) - chatTimestamp(left);
}

function chatDateGroupKey(chat: Chat, todayStart: number): ChatDateGroupKey {
  const timestamp = chatTimestamp(chat);

  if (timestamp >= todayStart) return "today";
  if (timestamp >= todayStart - DAY_MS) return "yesterday";
  if (timestamp >= todayStart - 2 * DAY_MS) return "dayBeforeYesterday";
  if (timestamp >= todayStart - 7 * DAY_MS) return "previousWeek";
  if (timestamp >= todayStart - 30 * DAY_MS) return "previousMonth";
  return "older";
}

function chatTimestamp(chat: Chat): number {
  return parseTimestamp(chat.updatedAt) ?? parseTimestamp(chat.createdAt) ?? 0;
}

function parseTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function startOfLocalDay(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

function displayChatTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return title === "New chat" ? t("workspace.newChat") : title;
}
