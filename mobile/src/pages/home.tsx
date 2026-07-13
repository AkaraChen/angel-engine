import type { ChatSummary } from "@/platform/chat-types";

import { ChatCircle, GitBranch, Plus, PushPin } from "@phosphor-icons/react";
import { formatDistanceToNow } from "date-fns";
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
import { CreateChatDrawer } from "@/features/chat/create-chat-drawer";
import { useChatList } from "@/features/chat/use-chats";
import { agentLabel } from "@/platform/agent-catalog";

/**
 * Home renders the mobile chat list backed by the daemon API. It mirrors the
 * desktop chat sidebar (runtime icon, title, project + worktree) adapted to
 * full-width touch rows, and hosts the New chat composer.
 */
export function HomePage() {
  const chatsQuery = useChatList();

  return (
    <div className="relative h-full">
      <ScrollArea className="h-full">
        {chatsQuery.isPending ? (
          <ChatListSkeleton />
        ) : chatsQuery.isError ? (
          <ErrorState onRetry={() => void chatsQuery.refetch()} />
        ) : chatsQuery.data.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col pb-24">
            {chatsQuery.data.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} />
            ))}
          </ul>
        )}
      </ScrollArea>

      <CreateChatDrawer>
        <Button
          aria-label="New chat"
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

function ChatListItem({ chat }: { chat: ChatSummary }) {
  const subtitle = [chat.projectName, chat.worktreeBranch].filter(Boolean);
  return (
    <li className="border-b border-border/60 last:border-b-0">
      <Link
        className="
          flex items-center gap-3 px-4 py-3
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
          <span className="flex items-center gap-1.5">
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
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatUpdatedAt(chat.updatedAt)}
            </span>
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="shrink-0">{agentLabel(chat.runtime)}</span>
            {subtitle.length > 0 ? (
              <>
                <span aria-hidden className="shrink-0">
                  ·
                </span>
                {chat.projectName !== null ? (
                  <span className="truncate">{chat.projectName}</span>
                ) : null}
                {chat.worktreeBranch !== null ? (
                  <span className="flex min-w-0 shrink items-center gap-0.5">
                    <GitBranch className="shrink-0" size={12} />
                    <span className="truncate">{chat.worktreeBranch}</span>
                  </span>
                ) : null}
              </>
            ) : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

function formatUpdatedAt(updatedAt: string): string {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistanceToNow(date, { addSuffix: true });
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
  return (
    <Empty className="px-6 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChatCircle size={28} />
        </EmptyMedia>
        <EmptyTitle>No chats yet</EmptyTitle>
        <EmptyDescription>
          Start a new agent session to see it here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <CreateChatDrawer>
          <Button>
            <Plus size={18} weight="bold" />
            New chat
          </Button>
        </CreateChatDrawer>
      </EmptyContent>
    </Empty>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Empty className="px-6 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChatCircle size={28} />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load chats</EmptyTitle>
        <EmptyDescription>
          The daemon may be offline or unreachable.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={onRetry} variant="outline">
          Try again
        </Button>
      </EmptyContent>
    </Empty>
  );
}
