import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Icon } from "@phosphor-icons/react";
import type { ReactElement, ReactNode } from "react";
import {
  Robot as Bot,
  House,
  NotePencil,
  Plus,
  X,
} from "@phosphor-icons/react";
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
  historyTabIcon?: Icon;
  historyTabLabel?: string;
  historyTabActive?: boolean;
}

export function ChatTabBar({
  activeChatId,
  chats,
  draftTabActive = false,
  historyTabActive = false,
  historyTabIcon,
  historyTabLabel,
  onCloseChat,
  onCloseDraftTab,
  onOpenHistory,
  onNewChat,
  onOpenChat,
}: ChatTabBarProps): ReactElement {
  const { t } = useTranslation();

  return (
    <div className="flex h-10 shrink-0 items-center bg-background px-2.5">
      <div
        className="
          flex min-w-0 items-center gap-px overflow-x-auto rounded-md
          bg-surface-1 p-0.5
          [&::-webkit-scrollbar]:hidden
        "
        data-slot="chat-tab-bar"
        role="tablist"
      >
        {is.nonEmptyString(historyTabLabel) && onOpenHistory ? (
          <HistoryTab
            icon={historyTabIcon}
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
            className="size-7 shrink-0 rounded-md text-muted-foreground"
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
    </div>
  );
}

/**
 * Shared tab chrome. Selection reads as a raised `--card` chip plus a 2px
 * `--primary` bar along the bottom edge — the app's one tab indicator
 * direction.
 */
function TabShell({
  active,
  children,
  className,
  onClick,
  title,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}): ReactElement {
  return (
    <div
      aria-selected={active}
      className={cn(
        `
          group/chat-tab relative flex h-7 max-w-60 min-w-0 shrink-0
          items-center gap-2 overflow-hidden rounded-md text-sm
          transition-colors duration-[120ms]
          motion-reduce:transition-none
        `,
        active
          ? "bg-card text-foreground"
          : `
            text-muted-foreground
            hover:bg-overlay-hover hover:text-foreground
            active:bg-overlay-active
          `,
        className,
      )}
      onClick={onClick}
      role="tab"
      title={title}
    >
      {children}
      {active ? (
        <span
          aria-hidden="true"
          className="
            pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full
            bg-primary
          "
        />
      ) : null}
    </div>
  );
}

function TabCloseButton({
  alwaysVisible,
  onClose,
}: {
  alwaysVisible: boolean;
  onClose: () => void;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <Button
      aria-label={t("workspace.closeTab")}
      className={cn(
        "size-6 shrink-0 rounded-sm opacity-0 transition-opacity",
        `
          group-focus-within/chat-tab:opacity-100
          group-hover/chat-tab:opacity-100
        `,
        alwaysVisible && "opacity-100",
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
  );
}

function HistoryTab({
  icon,
  isActive,
  label,
  onOpen,
}: {
  icon?: Icon;
  isActive: boolean;
  label: string;
  onOpen: () => MaybeAsync;
}): ReactElement {
  const TabIcon = icon ?? House;

  return (
    <TabShell active={isActive} title={label}>
      <button
        className="flex h-full min-w-0 flex-1 items-center gap-2 px-3 outline-hidden"
        onClick={() => void onOpen()}
        type="button"
      >
        <TabIcon className="size-4 shrink-0" />
        <span className="max-w-40 min-w-0 truncate text-left">{label}</span>
      </button>
    </TabShell>
  );
}

function DraftTab({ onClose }: { onClose?: () => MaybeAsync }): ReactElement {
  const { t } = useTranslation();

  return (
    <TabShell active className="pr-1 pl-3">
      <NotePencil className="size-4 shrink-0" />
      <span className="max-w-40 min-w-0 flex-1 truncate text-left">
        {t("workspace.newChat")}
      </span>
      {onClose ? (
        <TabCloseButton alwaysVisible onClose={() => void onClose()} />
      ) : null}
    </TabShell>
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
    <TabShell active={isActive} className="pr-1 pl-3">
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
            className="size-1.5 shrink-0 rounded-full bg-status-attention"
            role="img"
          />
        ) : null}
        {attention.completed ? (
          <span
            aria-label={t("sidebar.completed")}
            className="size-1.5 shrink-0 rounded-full bg-status-success"
            role="img"
          />
        ) : null}
        <ChatRunningPulse chatId={chat.id} />
      </button>
      <TabCloseButton alwaysVisible={isActive} onClose={onClose} />
    </TabShell>
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
            flex size-3.5 items-center justify-center
            [&_svg]:block [&_svg]:size-3.5 [&_svg]:shrink-0
          "
          // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          dangerouslySetInnerHTML={{ __html: runtimeIconSvg }}
        />
      ) : (
        <Bot className="size-3.5" />
      )}
    </span>
  );
}
