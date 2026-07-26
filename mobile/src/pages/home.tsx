import type { Locale } from "date-fns";
import type {
  ChatActivityRow,
  ChatActivitySegment,
} from "@/features/chat/activity-model";

import { ChatCircle, GitBranch, Plus, PushPin } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AgentRuntimeIcon } from "@/features/agents/agent-runtime-icon";
import {
  buildChatActivityRows,
  CHAT_ACTIVITY_SEGMENTS,
  countChatActivityRows,
  filterChatActivityRows,
} from "@/features/chat/activity-model";
import { ChatActivityBadge } from "@/features/chat/chat-activity-badge";
import { CreateChatDrawer } from "@/features/chat/create-chat-drawer";
import { useChatActivityList } from "@/features/chat/use-activity";
import { useChatList } from "@/features/chat/use-chats";
import { useDateFnsLocale } from "@/i18n/date-locale";
import { agentLabel } from "@/platform/agent-catalog";
import { cn } from "@/lib/utils";

const EMPTY_LIST: never[] = [];

const SEGMENT_LABEL_KEYS = {
  all: "home.segments.all",
  attention: "home.segments.attention",
  running: "home.segments.running",
  done: "home.segments.done",
} as const satisfies Record<ChatActivitySegment, string>;

/**
 * Home renders the mobile chat list backed by the daemon API. It mirrors the
 * desktop chat sidebar (runtime icon, title, project + worktree) adapted to
 * full-width touch rows, doubles as the parallel-agent overview by floating
 * chats with daemon activity to the top, and hosts the New chat composer.
 */
export function HomePage() {
  const { t } = useTranslation();
  const chatsQuery = useChatList();
  const activityQuery = useChatActivityList();
  const [segment, setSegment] = useState<ChatActivitySegment>("all");

  const chats = chatsQuery.data ?? EMPTY_LIST;
  const rows = useMemo(
    () =>
      buildChatActivityRows({
        activities: activityQuery.data ?? EMPTY_LIST,
        chats,
      }),
    [activityQuery.data, chats],
  );
  const counts = useMemo(() => countChatActivityRows(rows), [rows]);
  const visibleRows = useMemo(
    () => filterChatActivityRows(rows, segment),
    [rows, segment],
  );

  return (
    <div className="relative flex h-full min-w-0 flex-col overflow-hidden">
      {chatsQuery.isSuccess && chatsQuery.data.length > 0 ? (
        <div
          aria-label={t("home.filterSegments")}
          className="flex shrink-0 gap-1 overflow-x-auto px-4 py-2"
          role="group"
        >
          {CHAT_ACTIVITY_SEGMENTS.map((option) => (
            <button
              aria-pressed={segment === option}
              className={cn(
                `
                  flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3
                  text-xs font-medium text-muted-foreground
                `,
                segment === option && "bg-accent text-accent-foreground",
              )}
              key={option}
              onClick={() => setSegment(option)}
              type="button"
            >
              <span>{t(SEGMENT_LABEL_KEYS[option])}</span>
              <span className="tabular-nums opacity-70">{counts[option]}</span>
            </button>
          ))}
        </div>
      ) : null}

      <ScrollArea
        className="min-h-0 flex-1 min-w-0 max-w-full"
        viewportClassName="[&>div]:block! [&>div]:w-full! [&>div]:min-w-0!"
      >
        {chatsQuery.isPending ? (
          <ChatListSkeleton />
        ) : chatsQuery.isError ? (
          <ErrorState onRetry={() => void chatsQuery.refetch()} />
        ) : chatsQuery.data.length === 0 ? (
          <EmptyState />
        ) : visibleRows.length === 0 ? (
          <SegmentEmptyState />
        ) : (
          <ul className="flex w-full min-w-0 max-w-full flex-col overflow-hidden pb-24">
            {visibleRows.map((row) => (
              <ChatListItem key={row.chat.id} row={row} />
            ))}
          </ul>
        )}
      </ScrollArea>

      <CreateChatDrawer>
        <Button
          aria-label={t("common.newChat")}
          className="
            absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))]
            size-14 rounded-full shadow-lg
          "
          size="icon"
        >
          <Plus size={24} weight="bold" />
        </Button>
      </CreateChatDrawer>
    </div>
  );
}

function ChatListItem({ row }: { row: ChatActivityRow }) {
  const locale = useDateFnsLocale();
  const { activity, chat } = row;
  const subtitle = [chat.projectName, chat.worktreeBranch].filter(Boolean);
  return (
    <li className="w-full min-w-0 max-w-full border-b border-border/60 last:border-b-0">
      <Link
        className="
          flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden px-4
          py-3
          active:bg-accent
        "
        href={`/chat/${chat.id}`}
      >
        <span
          className="
            flex size-10 shrink-0 items-center justify-center rounded-full
            bg-muted text-foreground
          "
          title={agentLabel(chat.runtime)}
        >
          <AgentRuntimeIcon className="size-5" runtime={chat.runtime} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            {chat.pinned ? (
              <PushPin
                className="shrink-0 text-muted-foreground"
                size={12}
                weight="fill"
              />
            ) : null}
            <span className="min-w-0 flex-1 truncate font-medium">
              {chat.title}
            </span>
            <span className="ml-auto shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
              {formatUpdatedAt(chat.updatedAt, locale)}
            </span>
          </span>
          {activity !== null || subtitle.length > 0 ? (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {activity !== null ? (
                <ChatActivityBadge status={activity.status} />
              ) : null}
              {activity !== null && subtitle.length > 0 ? (
                <span aria-hidden className="shrink-0">
                  ·
                </span>
              ) : null}
              {chat.projectName !== null ? (
                <span className="truncate">{chat.projectName}</span>
              ) : null}
              {chat.projectName !== null && chat.worktreeBranch !== null ? (
                <span aria-hidden className="shrink-0">
                  ·
                </span>
              ) : null}
              {chat.worktreeBranch !== null ? (
                <span className="flex min-w-0 shrink items-center gap-0.5">
                  <GitBranch className="shrink-0" size={12} />
                  <span className="truncate">{chat.worktreeBranch}</span>
                </span>
              ) : null}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

function formatUpdatedAt(updatedAt: string, locale: Locale): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true, locale });
}

function ChatListSkeleton() {
  return (
    <ul className="flex flex-col">
      {Array.from({ length: 6 }, (_, index) => (
        <li
          className="flex items-center gap-3 border-b border-border/60 px-4 py-3"
          key={index}
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  const { t } = useTranslation();
  return (
    <Empty className="px-6 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChatCircle size={28} />
        </EmptyMedia>
        <EmptyTitle>{t("home.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("home.emptyDescription")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <CreateChatDrawer>
          <Button>
            <Plus size={18} weight="bold" />
            {t("common.newChat")}
          </Button>
        </CreateChatDrawer>
      </EmptyContent>
    </Empty>
  );
}

function SegmentEmptyState() {
  const { t } = useTranslation();
  return (
    <p className="px-6 py-16 text-center text-sm text-muted-foreground">
      {t("home.segmentEmpty")}
    </p>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Empty className="px-6 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChatCircle size={28} />
        </EmptyMedia>
        <EmptyTitle>{t("home.errorTitle")}</EmptyTitle>
        <EmptyDescription>{t("common.daemonOfflineHint")}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRetry} variant="outline">
          {t("common.tryAgain")}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
