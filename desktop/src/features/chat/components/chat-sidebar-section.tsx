import type { ReactElement } from "react";
import { AnimatePresence } from "framer-motion";
import { Loader2, MessageSquare } from "lucide-react";

import {
  AnimatedSidebarMenuItem,
  MacSidebarMenuButton,
  SidebarSectionHeader,
} from "@/components/workspace-sidebar-primitives";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { ChatRunningPulse } from "@/features/chat/components/chat-running-pulse";
import type { Chat } from "@/shared/chat";

type MaybeAsync = void | Promise<void>;

type ChatSidebarSectionProps = {
  isLoading: boolean;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  selectedChatId?: string;
  standaloneChats: Chat[];
};

export function ChatSidebarSection({
  isLoading,
  onOpenChat,
  onShowChatContextMenu,
  selectedChatId,
  standaloneChats,
}: ChatSidebarSectionProps): ReactElement {
  return (
    <SidebarGroup className="py-1">
      <SidebarSectionHeader label="Chats" />
      <SidebarGroupContent>
        <SidebarMenu>
          <AnimatePresence initial={false}>
            {isLoading ? (
              <AnimatedSidebarMenuItem key="chats-loading">
                <MacSidebarMenuButton disabled>
                  <Loader2 className="animate-spin" />
                  <span>Loading chats</span>
                </MacSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            ) : null}

            {!isLoading && standaloneChats.length === 0 ? (
              <AnimatedSidebarMenuItem key="chats-empty">
                <MacSidebarMenuButton disabled>
                  <MessageSquare />
                  <span>No standalone chats</span>
                </MacSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            ) : null}

            {standaloneChats.map((chat) => (
              <AnimatedSidebarMenuItem key={chat.id}>
                <MacSidebarMenuButton
                  isActive={chat.id === selectedChatId}
                  onClick={() => void onOpenChat(chat)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void onShowChatContextMenu(chat);
                  }}
                  title={chat.cwd ?? chat.title}
                >
                  <MessageSquare />
                  <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                  <ChatRunningPulse chatId={chat.id} />
                </MacSidebarMenuButton>
              </AnimatedSidebarMenuItem>
            ))}
          </AnimatePresence>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
