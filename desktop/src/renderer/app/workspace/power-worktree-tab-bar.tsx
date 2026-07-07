import type { Chat } from "@shared/chat";
import type { ReactElement } from "react";

import { useTranslation } from "react-i18next";
import { ChatTabBar } from "@/features/chat/components/chat-tab-bar";

type MaybeAsync = void | Promise<void>;

interface PowerWorktreeTabBarProps {
  activeChatId?: string;
  chats: Chat[];
  draftTabActive: boolean;
  homeTabActive: boolean;
  onCloseChat: (chat: Chat) => MaybeAsync;
  onCloseDraftTab: () => MaybeAsync;
  onNewChat: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  onOpenHome: () => MaybeAsync;
}

export function PowerWorktreeTabBar({
  activeChatId,
  chats,
  draftTabActive,
  homeTabActive,
  onCloseChat,
  onCloseDraftTab,
  onNewChat,
  onOpenChat,
  onOpenHome,
}: PowerWorktreeTabBarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <ChatTabBar
      activeChatId={activeChatId}
      chats={chats}
      draftTabActive={draftTabActive}
      historyTabActive={homeTabActive}
      historyTabLabel={t("sidebar.powerWorktreeHome")}
      onCloseChat={onCloseChat}
      onCloseDraftTab={onCloseDraftTab}
      onNewChat={onNewChat}
      onOpenChat={onOpenChat}
      onOpenHistory={onOpenHome}
    />
  );
}
