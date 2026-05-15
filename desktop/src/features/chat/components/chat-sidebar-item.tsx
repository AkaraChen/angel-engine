import type { MouseEventHandler, ReactElement } from "react";
import { Archive } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  WorkspaceSidebarMenuAction,
  WorkspaceSidebarMenuButton,
} from "@/components/workspace-sidebar-primitives";
import { useChatAttention } from "@/features/chat/state/chat-run-store";

import { ChatRunningPulse } from "./chat-running-pulse";

interface ChatSidebarItemProps {
  chatId: string;
  title: string;
  tooltip: string;
  isActive: boolean;
  onArchiveChat?: () => Promise<void> | void;
  onOpenChat: () => void;
  onShowContextMenu?: () => Promise<void> | void;
}

export function ChatSidebarItem({
  chatId,
  title,
  tooltip,
  isActive,
  onArchiveChat,
  onOpenChat,
  onShowContextMenu,
}: ChatSidebarItemProps): ReactElement {
  const { t } = useTranslation();
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
          className="
            block min-w-0 flex-1 truncate overflow-hidden text-left
            whitespace-nowrap
          "
          title={title}
        >
          {title}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <ChatAttentionIndicators chatId={chatId} />
          <ChatRunningPulse chatId={chatId} />
        </span>
      </WorkspaceSidebarMenuButton>
      {onArchiveChat ? (
        <WorkspaceSidebarMenuAction
          aria-label={t("sidebar.archiveChat")}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void onArchiveChat();
          }}
          showOnHover
          title={t("sidebar.archiveChat")}
          type="button"
        >
          <Archive />
        </WorkspaceSidebarMenuAction>
      ) : null}
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
          className="
                size-1.5 rounded-full bg-amber-400
                shadow-[0_0_0_1px_rgba(245,158,11,0.34)]
              "
          role="img"
        />
      ) : null}
      {attention.completed ? (
        <span
          aria-label={t("sidebar.completed")}
          className="
                size-1.5 rounded-full bg-emerald-500
                shadow-[0_0_0_1px_rgba(16,185,129,0.28)]
              "
          role="img"
        />
      ) : null}
    </span>
  );
}
