import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ReactElement } from "react";

import { useTranslation } from "react-i18next";
import {
  ChatTabBar,
  POWER_CHAT_TAB_PANEL_ID,
} from "@/features/chat/components/chat-tab-bar";

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
  tabPanelId?: string;
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
  tabPanelId = POWER_CHAT_TAB_PANEL_ID,
}: PowerWorktreeTabBarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <ChatTabBar
      activeChatId={activeChatId}
      chats={chats}
      draftTabActive={draftTabActive}
      historyTabActive={homeTabActive}
      historyTabLabel={t("sidebar.powerWorktreeHome")}
      tabPanelId={tabPanelId}
      onCloseChat={onCloseChat}
      onCloseDraftTab={onCloseDraftTab}
      onNewChat={onNewChat}
      onOpenChat={onOpenChat}
      onOpenHistory={onOpenHome}
    />
  );
}
