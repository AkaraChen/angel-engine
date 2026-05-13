import { useState } from "react";
import type { ReactElement } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Loader2, MessageSquare } from "lucide-react";

import {
  AnimatedSidebarMenuItem,
  MacSidebarMenuButton,
  SidebarSectionHeader,
  sidebarMotion,
} from "@/components/workspace-sidebar-primitives";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { ChatSidebarItem } from "@/features/chat/components/chat-sidebar-item";
import type { Chat } from "@/shared/chat";

type MaybeAsync = void | Promise<void>;

type ChatSidebarSectionProps = {
  isLoading: boolean;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onRenameChat: (chat: Chat) => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  selectedChatId?: string;
  standaloneChats: Chat[];
};

export function ChatSidebarSection({
  isLoading,
  onOpenChat,
  onRenameChat,
  onShowChatContextMenu,
  selectedChatId,
  standaloneChats,
}: ChatSidebarSectionProps): ReactElement {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <SidebarGroup className="py-1">
      <SidebarSectionHeader label="Chats">
        <Button asChild size="icon-xs" title="Toggle chats" variant="ghost">
          <motion.button
            onClick={() => setIsCollapsed((current) => !current)}
            transition={sidebarMotion}
            type="button"
            whileTap={{ scale: 0.96 }}
          >
            <motion.span animate={{ rotate: isCollapsed ? 0 : 90 }}>
              <ChevronRight className="size-4" />
            </motion.span>
            <span className="sr-only">Toggle chats</span>
          </motion.button>
        </Button>
      </SidebarSectionHeader>
      <SidebarGroupContent>
        <AnimatePresence initial={false}>
          {!isCollapsed ? (
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
                    <ChatSidebarItem
                      chatId={chat.id}
                      isActive={chat.id === selectedChatId}
                      onOpenChat={() => void onOpenChat(chat)}
                      onRenameChat={() => void onRenameChat(chat)}
                      onShowContextMenu={() => onShowChatContextMenu(chat)}
                      title={chat.title}
                      tooltip={chat.cwd ?? chat.title}
                    />
                  </AnimatedSidebarMenuItem>
                ))}
              </AnimatePresence>
            </SidebarMenu>
          ) : null}
        </AnimatePresence>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
