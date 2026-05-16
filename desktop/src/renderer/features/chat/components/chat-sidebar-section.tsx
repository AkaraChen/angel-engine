import type { Chat } from "@shared/chat";
import type { ReactElement } from "react";
import {
  RiArrowRightSLine as ChevronRight,
  RiLoader4Line as Loader2,
  RiMessage2Line as MessageSquare,
} from "@remixicon/react";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import {
  AnimatedSidebarMenuItem,
  sidebarMotion,
  SidebarSectionHeader,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import { ChatSidebarItem } from "@/features/chat/components/chat-sidebar-item";

type MaybeAsync = void | Promise<void>;

interface ChatSidebarSectionProps {
  isLoading: boolean;
  onArchiveChat: (chat: Chat) => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onShowChatContextMenu: (chat: Chat) => MaybeAsync;
  selectedChatId?: string;
  standaloneChats: Chat[];
}

export function ChatSidebarSection({
  isLoading,
  onArchiveChat,
  onOpenChat,
  onShowChatContextMenu,
  selectedChatId,
  standaloneChats,
}: ChatSidebarSectionProps): ReactElement {
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <SidebarGroup className="py-1">
      <SidebarSectionHeader label={t("sidebar.chats")}>
        <Button
          asChild
          size="icon-xs"
          title={t("sidebar.toggleChats")}
          variant="ghost"
        >
          <motion.button
            onClick={() => setIsCollapsed((current) => !current)}
            transition={sidebarMotion}
            type="button"
            whileTap={{ scale: 0.96 }}
          >
            <motion.span animate={{ rotate: isCollapsed ? 0 : 90 }}>
              <ChevronRight className="size-4" />
            </motion.span>
            <span className="sr-only">{t("sidebar.toggleChats")}</span>
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
                    <WorkspaceSidebarMenuButton disabled>
                      <Loader2 className="animate-spin" />
                      <span>{t("sidebar.loadingChats")}</span>
                    </WorkspaceSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ) : null}

                {!isLoading && standaloneChats.length === 0 ? (
                  <AnimatedSidebarMenuItem key="chats-empty">
                    <WorkspaceSidebarMenuButton disabled>
                      <MessageSquare />
                      <span>{t("sidebar.noStandaloneChats")}</span>
                    </WorkspaceSidebarMenuButton>
                  </AnimatedSidebarMenuItem>
                ) : null}

                {standaloneChats.map((chat) => (
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
                      tooltip={displayChatTitle(chat.title, t)}
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

function displayChatTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return title === "New chat" ? t("workspace.newChat") : title;
}
