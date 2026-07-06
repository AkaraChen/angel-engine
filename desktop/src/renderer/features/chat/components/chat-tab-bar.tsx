import type { Chat } from "@shared/chat";
import type { ReactElement } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ChatRunningPulse } from "@/features/chat/components/chat-running-pulse";
import { useChatAttention } from "@/features/chat/state/chat-run-store";
import { cn } from "@/platform/utils";

type MaybeAsync = void | Promise<void>;

interface ChatTabBarProps {
  activeChatId?: string;
  chats: Chat[];
  draftTabActive?: boolean;
  onCloseChat: (chat: Chat) => MaybeAsync;
  onCloseDraftTab?: () => MaybeAsync;
  onNewChat: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
}

export function ChatTabBar({
  activeChatId,
  chats,
  draftTabActive = false,
  onCloseChat,
  onCloseDraftTab,
  onNewChat,
  onOpenChat,
}: ChatTabBarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      className="
        flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b
        border-border-subtle bg-background/60 px-2
      "
      data-slot="chat-tab-bar"
      role="tablist"
    >
      {chats.map((chat) => (
        <ChatTab
          chat={chat}
          isActive={!draftTabActive && chat.id === activeChatId}
          key={chat.id}
          onClose={() => void onCloseChat(chat)}
          onOpen={() => void onOpenChat(chat)}
        />
      ))}
      {draftTabActive ? (
        <DraftTab onClose={onCloseDraftTab} />
      ) : (
        <Button
          aria-label={t("workspace.newChat")}
          className="size-6 shrink-0 text-muted-foreground"
          onClick={() => void onNewChat()}
          size="icon-xs"
          title={t("workspace.newChat")}
          type="button"
          variant="ghost"
        >
          <Plus className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function DraftTab({ onClose }: { onClose?: () => MaybeAsync }): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      aria-selected
      className="
        group/chat-tab flex h-7 max-w-52 min-w-0 shrink-0 items-center gap-1.5
        rounded-md bg-muted pr-1 pl-2.5 text-xs text-foreground
      "
      role="tab"
    >
      <span className="min-w-0 flex-1 truncate text-left">
        {t("workspace.newChat")}
      </span>
      {onClose ? (
        <Button
          aria-label={t("workspace.closeTab")}
          className="size-5 shrink-0"
          onClick={() => void onClose()}
          size="icon-xs"
          title={t("workspace.closeTab")}
          type="button"
          variant="ghost"
        >
          <X className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}

function ChatTab({
  chat,
  isActive,
  onClose,
  onOpen,
}: {
  chat: Chat;
  isActive: boolean;
  onClose: () => void;
  onOpen: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const attention = useChatAttention(chat.id);
  const title = chat.title === "New chat" ? t("workspace.newChat") : chat.title;

  return (
    <div
      className={cn(
        `
          group/chat-tab flex h-7 max-w-52 min-w-0 shrink-0 items-center gap-1.5
          rounded-md pr-1 pl-2.5 text-xs transition-colors
        `,
        isActive
          ? "bg-muted text-foreground"
          : `
            text-muted-foreground
            hover:bg-muted/55 hover:text-foreground
          `,
      )}
      role="tab"
      aria-selected={isActive}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-1.5 outline-hidden"
        onClick={onOpen}
        title={title}
        type="button"
      >
        <span className="min-w-0 flex-1 truncate text-left">{title}</span>
        {attention.needsInput ? (
          <span
            aria-label={t("sidebar.needsInput")}
            className="size-1.5 shrink-0 rounded-full bg-amber-400"
            role="img"
          />
        ) : null}
        {attention.completed ? (
          <span
            aria-label={t("sidebar.completed")}
            className="size-1.5 shrink-0 rounded-full bg-emerald-500"
            role="img"
          />
        ) : null}
        <ChatRunningPulse chatId={chat.id} />
      </button>
      <Button
        aria-label={t("workspace.closeTab")}
        className={cn(
          "size-5 shrink-0 opacity-0 transition-opacity",
          `
            group-focus-within/chat-tab:opacity-100
            group-hover/chat-tab:opacity-100
          `,
          isActive && "opacity-100",
        )}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        size="icon-xs"
        title={t("workspace.closeTab")}
        type="button"
        variant="ghost"
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
