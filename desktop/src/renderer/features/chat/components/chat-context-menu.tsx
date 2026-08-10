import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ReactElement, ReactNode } from "react";
import type { ChatContextMenuAction } from "@/features/chat/api/queries";

import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

interface ChatContextMenuProps {
  chat: Chat;
  children: ReactNode;
  onAction: (chat: Chat, action: ChatContextMenuAction) => void;
}

export function ChatContextMenu({
  chat,
  children,
  onAction,
}: ChatContextMenuProps): ReactElement {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => onAction(chat, "togglePin")}>
          {t(chat.pinned ? "common.unpin" : "common.pin")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAction(chat, "rename")}>
          {t("common.rename")}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onAction(chat, "handoff")}>
          {t("messages.handoff")}
        </ContextMenuItem>
        {import.meta.env.DEV ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => onAction(chat, "copyJson")}>
              Copy chat entity as JSON
            </ContextMenuItem>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onAction(chat, "delete")}
          variant="destructive"
        >
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
