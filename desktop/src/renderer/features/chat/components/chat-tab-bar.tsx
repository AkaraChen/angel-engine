import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ReactElement } from "react";
import { Robot as Bot, House, Plus, X } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
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
  onOpenHistory?: () => MaybeAsync;
  onNewChat: () => MaybeAsync;
  onOpenChat: (chat: Chat) => MaybeAsync;
  historyTabLabel?: string;
  historyTabActive?: boolean;
}

export function ChatTabBar({
  activeChatId,
  chats,
  draftTabActive = false,
  historyTabActive = false,
  historyTabLabel,
  onCloseChat,
  onCloseDraftTab,
  onOpenHistory,
  onNewChat,
  onOpenChat,
}: ChatTabBarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      className="
        flex h-10 shrink-0 items-center gap-1.5 overflow-x-auto border-b
        border-border-subtle bg-background/60 px-2.5
      "
      data-slot="chat-tab-bar"
      role="tablist"
    >
      {historyTabLabel && onOpenHistory ? (
        <HistoryTab
          isActive={historyTabActive}
          label={historyTabLabel}
          onOpen={onOpenHistory}
        />
      ) : null}
      {chats.map((chat) => (
        <ChatTab
          chat={chat}
          isActive={
            !historyTabActive && !draftTabActive && chat.id === activeChatId
          }
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
          className="size-7 shrink-0 text-muted-foreground"
          onClick={() => void onNewChat()}
          size="icon-sm"
          title={t("workspace.newChat")}
          type="button"
          variant="ghost"
        >
          <Plus className="size-4" />
        </Button>
      )}
    </div>
  );
}

function HistoryTab({
  isActive,
  label,
  onOpen,
}: {
  isActive: boolean;
  label: string;
  onOpen: () => MaybeAsync;
}): ReactElement {
  return (
    <button
      aria-selected={isActive}
      className={cn(
        `
          flex h-8 max-w-60 min-w-0 shrink-0 items-center gap-2 rounded-md px-3
          text-sm transition-colors
        `,
        isActive
          ? "bg-muted text-foreground"
          : `
            text-muted-foreground
            hover:bg-muted/55 hover:text-foreground
          `,
      )}
      onClick={() => void onOpen()}
      role="tab"
      title={label}
      type="button"
    >
      <House className="size-4 shrink-0" weight="duotone" />
      <span className="max-w-40 min-w-0 truncate text-left">{label}</span>
    </button>
  );
}

function DraftTab({ onClose }: { onClose?: () => MaybeAsync }): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      aria-selected
      className="
        group/chat-tab flex h-8 max-w-60 min-w-0 shrink-0 items-center gap-2
        rounded-md bg-muted pr-1.5 pl-3 text-sm text-foreground
      "
      role="tab"
    >
      <span className="max-w-40 min-w-0 flex-1 truncate text-left">
        {t("workspace.newChat")}
      </span>
      {onClose ? (
        <Button
          aria-label={t("workspace.closeTab")}
          className="size-6 shrink-0"
          onClick={() => void onClose()}
          size="icon-xs"
          title={t("workspace.closeTab")}
          type="button"
          variant="ghost"
        >
          <X className="size-3.5" />
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
          group/chat-tab flex h-8 max-w-60 min-w-0 shrink-0 items-center gap-2
          rounded-md pr-1.5 pl-3 text-sm transition-colors
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
        className="flex min-w-0 flex-1 items-center gap-2 outline-hidden"
        onClick={onOpen}
        title={title}
        type="button"
      >
        <AgentIcon runtime={chat.runtime} />
        <span className="max-w-40 min-w-0 flex-1 truncate text-left">
          {title}
        </span>
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
          "size-6 shrink-0 opacity-0 transition-opacity",
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
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

function AgentIcon({ runtime }: { runtime?: string | null }): ReactElement {
  const runtimeIconSvg = agentRuntimeIconSvg(runtime);
  const runtimeLabel = agentRuntimeLabel(runtime);

  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center"
      title={runtimeLabel}
    >
      {is.nonEmptyString(runtimeIconSvg) ? (
        <span
          aria-hidden="true"
          className="
            flex size-3.5 items-center justify-center text-muted-foreground
            [&_svg]:block [&_svg]:size-3.5 [&_svg]:shrink-0
          "
          // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          dangerouslySetInnerHTML={{ __html: runtimeIconSvg }}
        />
      ) : (
        <Bot className="size-3.5 text-muted-foreground" />
      )}
    </span>
  );
}
