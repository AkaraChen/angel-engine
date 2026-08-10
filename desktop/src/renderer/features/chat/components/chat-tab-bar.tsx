import type { Chat } from "@angel-engine/daemon-api/chat";
import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from "react";

import { Robot as Bot, House, Plus, X } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { displayChatTitle } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
import {
  ChatRunningPulse,
  ChatStatusCue,
} from "@/features/chat/components/chat-running-pulse";
import { useChatAttention } from "@/features/chat/state/chat-run-store";
import { cn } from "@/platform/utils";

type MaybeAsync = void | Promise<void>;

/** Stable panel id controlled by power-mode chat tabs. */
export const POWER_CHAT_TAB_PANEL_ID = "power-chat-panel";

export const POWER_CHAT_TAB_HOME_ID = "home";
export const POWER_CHAT_TAB_DRAFT_ID = "draft";

export function powerChatTabId(tabKey: string): string {
  return `power-chat-tab-${tabKey}`;
}

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
  /** Element id of the associated `role="tabpanel"`. */
  tabPanelId?: string;
}

type ChatTabKey = string;

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
  tabPanelId = POWER_CHAT_TAB_PANEL_ID,
}: ChatTabBarProps): ReactElement {
  const { t } = useTranslation();
  const tablistRef = useRef<HTMLDivElement>(null);
  const tabButtonsRef = useRef(new Map<ChatTabKey, HTMLButtonElement>());

  const tabKeys = useMemo((): ChatTabKey[] => {
    const keys: ChatTabKey[] = [];
    if (historyTabLabel && onOpenHistory) {
      keys.push(POWER_CHAT_TAB_HOME_ID);
    }
    for (const chat of chats) {
      keys.push(chat.id);
    }
    if (draftTabActive) {
      keys.push(POWER_CHAT_TAB_DRAFT_ID);
    }
    return keys;
  }, [chats, draftTabActive, historyTabLabel, onOpenHistory]);

  const selectedTabKey = historyTabActive
    ? POWER_CHAT_TAB_HOME_ID
    : draftTabActive
      ? POWER_CHAT_TAB_DRAFT_ID
      : is.nonEmptyString(activeChatId)
        ? activeChatId
        : undefined;

  const focusTabKey =
    selectedTabKey !== undefined && tabKeys.includes(selectedTabKey)
      ? selectedTabKey
      : tabKeys[0];

  const setTabButtonRef = useCallback(
    (tabKey: ChatTabKey, button: HTMLButtonElement | null) => {
      if (button) {
        tabButtonsRef.current.set(tabKey, button);
      } else {
        tabButtonsRef.current.delete(tabKey);
      }
    },
    [],
  );

  const selectTabKey = useCallback(
    (tabKey: ChatTabKey) => {
      if (tabKey === POWER_CHAT_TAB_HOME_ID) {
        void onOpenHistory?.();
        return;
      }
      if (tabKey === POWER_CHAT_TAB_DRAFT_ID) {
        // Draft only appears while already active; selection is a no-op.
        return;
      }
      const chat = chats.find((candidate) => candidate.id === tabKey);
      if (chat) {
        void onOpenChat(chat);
      }
    },
    [chats, onOpenChat, onOpenHistory],
  );

  const focusTabInDom = useCallback((tabKey: ChatTabKey) => {
    window.requestAnimationFrame(() => {
      const button = tabButtonsRef.current.get(tabKey);
      button?.focus();
      button?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }, []);

  const selectAndFocusTab = useCallback(
    (index: number) => {
      const tabKey = tabKeys.at(index);
      if (tabKey === undefined) {
        return;
      }
      selectTabKey(tabKey);
      focusTabInDom(tabKey);
    },
    [focusTabInDom, selectTabKey, tabKeys],
  );

  const focusSelectedTab = useCallback(() => {
    window.requestAnimationFrame(() => {
      tablistRef.current
        ?.querySelector<HTMLButtonElement>('[role="tab"][tabindex="0"]')
        ?.focus();
    });
  }, []);

  useEffect(() => {
    if (focusTabKey === undefined) {
      return;
    }
    tabButtonsRef.current
      .get(focusTabKey)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [focusTabKey]);

  const handleTabKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>, tabKey: ChatTabKey) => {
      const currentIndex = tabKeys.indexOf(tabKey);
      if (currentIndex < 0) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (tabKey === POWER_CHAT_TAB_HOME_ID) {
          return;
        }
        event.preventDefault();
        if (tabKey === POWER_CHAT_TAB_DRAFT_ID) {
          void onCloseDraftTab?.();
        } else {
          const chat = chats.find((candidate) => candidate.id === tabKey);
          if (chat) {
            void onCloseChat(chat);
          }
        }
        focusSelectedTab();
        return;
      }

      let nextIndex: number | null = null;
      if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = tabKeys.length - 1;
      } else if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % tabKeys.length;
      } else if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + tabKeys.length) % tabKeys.length;
      }

      if (nextIndex === null) {
        return;
      }

      event.preventDefault();
      selectAndFocusTab(nextIndex);
    },
    [
      chats,
      focusSelectedTab,
      onCloseChat,
      onCloseDraftTab,
      selectAndFocusTab,
      tabKeys,
    ],
  );

  return (
    <div
      className="
        flex h-10 shrink-0 items-center bg-background/60 px-2.5
      "
    >
      <div
        aria-label={t("workspace.chatTabs")}
        className="
          flex min-w-0 items-center gap-px overflow-x-auto rounded-md
          bg-surface-1 p-0.5
          [&::-webkit-scrollbar]:hidden
        "
        data-slot="chat-tab-bar"
        ref={tablistRef}
        role="tablist"
      >
        {historyTabLabel && onOpenHistory ? (
          <HistoryTab
            isActive={historyTabActive}
            isFocusable={focusTabKey === POWER_CHAT_TAB_HOME_ID}
            label={historyTabLabel}
            tabId={powerChatTabId(POWER_CHAT_TAB_HOME_ID)}
            tabPanelId={tabPanelId}
            onKeyDown={(event) =>
              handleTabKeyDown(event, POWER_CHAT_TAB_HOME_ID)
            }
            onOpen={() => selectTabKey(POWER_CHAT_TAB_HOME_ID)}
            setTabButtonRef={(button) =>
              setTabButtonRef(POWER_CHAT_TAB_HOME_ID, button)
            }
          />
        ) : null}
        {chats.map((chat) => {
          const isActive =
            !historyTabActive && !draftTabActive && chat.id === activeChatId;
          return (
            <ChatTab
              chat={chat}
              isActive={isActive}
              isFocusable={focusTabKey === chat.id}
              key={chat.id}
              tabId={powerChatTabId(chat.id)}
              tabPanelId={tabPanelId}
              onClose={() => {
                void onCloseChat(chat);
                focusSelectedTab();
              }}
              onKeyDown={(event) => handleTabKeyDown(event, chat.id)}
              onOpen={() => selectTabKey(chat.id)}
              setTabButtonRef={(button) => setTabButtonRef(chat.id, button)}
            />
          );
        })}
        {draftTabActive ? (
          <DraftTab
            isFocusable={focusTabKey === POWER_CHAT_TAB_DRAFT_ID}
            tabId={powerChatTabId(POWER_CHAT_TAB_DRAFT_ID)}
            tabPanelId={tabPanelId}
            onClose={
              onCloseDraftTab
                ? () => {
                    void onCloseDraftTab();
                    focusSelectedTab();
                  }
                : undefined
            }
            onKeyDown={(event) =>
              handleTabKeyDown(event, POWER_CHAT_TAB_DRAFT_ID)
            }
            setTabButtonRef={(button) =>
              setTabButtonRef(POWER_CHAT_TAB_DRAFT_ID, button)
            }
          />
        ) : (
          <Button
            aria-label={t("workspace.newChat")}
            className="size-7 shrink-0 rounded-sm text-muted-foreground"
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

const tabButtonClassName = `
  flex h-7 min-w-0 flex-1 items-center gap-2 rounded-sm pl-3 text-sm
  outline-none transition-colors
  focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset
  motion-reduce:transition-none
`;

function HistoryTab({
  isActive,
  isFocusable,
  label,
  onKeyDown,
  onOpen,
  setTabButtonRef,
  tabId,
  tabPanelId,
}: {
  isActive: boolean;
  isFocusable: boolean;
  label: string;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
  setTabButtonRef: (button: HTMLButtonElement | null) => void;
  tabId: string;
  tabPanelId: string;
}): ReactElement {
  return (
    <div
      className={cn(
        "group/chat-tab flex h-7 max-w-60 min-w-0 shrink-0 items-center",
        isActive ? "rounded-sm bg-card text-foreground shadow-xs" : undefined,
      )}
      role="presentation"
    >
      <button
        aria-controls={tabPanelId}
        aria-selected={isActive}
        className={cn(
          tabButtonClassName,
          "max-w-60 pr-3",
          isActive
            ? "text-foreground"
            : `
              text-muted-foreground
              hover:bg-overlay-hover hover:text-foreground
              active:bg-overlay-active
            `,
        )}
        id={tabId}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        ref={setTabButtonRef}
        role="tab"
        tabIndex={isFocusable ? 0 : -1}
        title={label}
        type="button"
      >
        <House className="size-4 shrink-0" weight="duotone" />
        <span className="max-w-40 min-w-0 truncate text-left">{label}</span>
      </button>
    </div>
  );
}

function DraftTab({
  isFocusable,
  onClose,
  onKeyDown,
  setTabButtonRef,
  tabId,
  tabPanelId,
}: {
  isFocusable: boolean;
  onClose?: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  setTabButtonRef: (button: HTMLButtonElement | null) => void;
  tabId: string;
  tabPanelId: string;
}): ReactElement {
  const { t } = useTranslation();
  const label = t("workspace.newChat");

  return (
    <div
      className="
        group/chat-tab flex h-7 max-w-60 min-w-0 shrink-0 items-center
        rounded-sm bg-card text-foreground shadow-xs
      "
      role="presentation"
    >
      <button
        aria-controls={tabPanelId}
        aria-selected
        className={cn(tabButtonClassName, onClose ? "pr-1" : "pr-3")}
        id={tabId}
        onKeyDown={onKeyDown}
        ref={setTabButtonRef}
        role="tab"
        tabIndex={isFocusable ? 0 : -1}
        title={label}
        type="button"
      >
        <span className="max-w-40 min-w-0 flex-1 truncate text-left">
          {label}
        </span>
      </button>
      {onClose ? (
        <Button
          aria-label={`${t("common.close")} ${label}`}
          className="size-6 shrink-0"
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
      ) : null}
    </div>
  );
}

function ChatTab({
  chat,
  isActive,
  isFocusable,
  onClose,
  onKeyDown,
  onOpen,
  setTabButtonRef,
  tabId,
  tabPanelId,
}: {
  chat: Chat;
  isActive: boolean;
  isFocusable: boolean;
  onClose: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
  onOpen: () => void;
  setTabButtonRef: (button: HTMLButtonElement | null) => void;
  tabId: string;
  tabPanelId: string;
}): ReactElement {
  const { t } = useTranslation();
  const attention = useChatAttention(chat.id);
  const title = displayChatTitle(chat.title, t);

  return (
    <div
      className={cn(
        `
          group/chat-tab flex h-7 max-w-60 min-w-0 shrink-0 items-center
          rounded-sm text-sm
        `,
        isActive
          ? "bg-card text-foreground shadow-xs"
          : `
            text-muted-foreground
            hover:bg-overlay-hover hover:text-foreground
            active:bg-overlay-active
          `,
      )}
      role="presentation"
    >
      <button
        aria-controls={tabPanelId}
        aria-selected={isActive}
        className={cn(tabButtonClassName, "pr-1")}
        id={tabId}
        onClick={onOpen}
        onKeyDown={onKeyDown}
        ref={setTabButtonRef}
        role="tab"
        tabIndex={isFocusable ? 0 : -1}
        title={title}
        type="button"
      >
        <AgentIcon runtime={chat.runtime} />
        <span className="max-w-40 min-w-0 flex-1 truncate text-left">
          {title}
        </span>
        {attention.needsInput ? <ChatStatusCue kind="needsInput" /> : null}
        {attention.completed ? <ChatStatusCue kind="completed" /> : null}
        <ChatRunningPulse chatId={chat.id} />
      </button>
      <Button
        aria-label={`${t("common.close")} ${title}`}
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
      aria-hidden="true"
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
