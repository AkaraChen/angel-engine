import type { ChatSummary } from "@/platform/chat-types";

import { ChatCircle, PencilSimple } from "@phosphor-icons/react";
import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DaemonStatus } from "@/pages/home-daemon-status";

/**
 * Home shows the chat list. Real data lands in a later sub-issue; this stub
 * renders the shape the list page will consume.
 */
export function HomePage() {
  const chats: ChatSummary[] = [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header
        className="
        flex shrink-0 items-center justify-between px-4 pt-3 pb-2
      "
      >
        <h1 className="font-heading text-xl font-semibold">Chats</h1>
        <Button size="icon" variant="ghost">
          <PencilSimple size={20} />
        </Button>
      </header>
      <DaemonStatus />
      <ScrollArea className="min-h-0 flex-1">
        {chats.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col">
            {chats.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} />
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
}

function ChatListItem({ chat }: { chat: ChatSummary }) {
  return (
    <li>
      <Link
        className="
          flex items-center gap-3 px-4 py-3
          active:bg-accent
        "
        href={`/chat/${chat.id}`}
      >
        <ChatCircle className="text-muted-foreground" size={24} />
        <span className="min-w-0 flex-1 truncate font-medium">
          {chat.title}
        </span>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div
      className="
      flex flex-col items-center gap-2 px-6 py-16 text-center
      text-muted-foreground
    "
    >
      <ChatCircle size={40} />
      <p className="text-sm">No chats yet.</p>
    </div>
  );
}
