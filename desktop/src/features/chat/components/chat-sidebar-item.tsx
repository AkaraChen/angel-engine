import type { MouseEventHandler, ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceSidebarMenuButton } from "@/components/workspace-sidebar-primitives";
import { useChatAttention } from "@/features/chat/state/chat-run-store";

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
    <>
      <WorkspaceSidebarMenuButton
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
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <ChatAttentionIndicators chatId={chatId} />
          <ChatRunningPulse chatId={chatId} />
        </span>
      </WorkspaceSidebarMenuButton>
    </>
  );
}

function ChatAttentionIndicators({
  chatId,
}: {
  chatId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const attention = useChatAttention(chatId);
  if (!attention.needsInput && !attention.completed) return null;

  return (
    <span
      aria-label={t("sidebar.chatAttention")}
      className="flex shrink-0 items-center gap-1"
      title={t("sidebar.chatAttention")}
    >
      {attention.needsInput ? (
        <span
          aria-label={t("sidebar.needsInput")}
          className="size-2 rounded-full bg-amber-400 shadow-[0_0_0_1px_rgba(245,158,11,0.42),0_0_0_4px_rgba(245,158,11,0.14)]"
          role="img"
        />
      ) : null}
      {attention.completed ? (
        <span
          aria-label={t("sidebar.completed")}
          className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]"
          role="img"
        />
      ) : null}
    </span>
  );
}
