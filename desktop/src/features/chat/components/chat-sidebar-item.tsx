import type { MouseEventHandler, ReactElement } from "react";

import { MacSidebarMenuButton } from "@/components/workspace-sidebar-primitives";

import { ChatRunningPulse } from "./chat-running-pulse";

type ChatSidebarItemProps = {
  chatId: string;
  title: string;
  tooltip: string;
  isActive: boolean;
  onOpenChat: () => void;
  onShowContextMenu?: () => Promise<void> | void;
};

export function ChatSidebarItem({
  chatId,
  title,
  tooltip,
  isActive,
  onOpenChat,
  onShowContextMenu,
}: ChatSidebarItemProps): ReactElement {
  const handleContextMenu: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    if (onShowContextMenu) {
      void onShowContextMenu();
    }
  };

  return (
    <MacSidebarMenuButton
      isActive={isActive}
      onClick={onOpenChat}
      onContextMenu={onShowContextMenu ? handleContextMenu : undefined}
      title={tooltip}
    >
      <span
        className="block min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap text-left"
        title={title}
      >
        {title}
      </span>
      <ChatRunningPulse chatId={chatId} />
    </MacSidebarMenuButton>
  );
}
