import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ReactElement } from "react";

import {
  Archive,
  Robot as Bot,
  ChatCircleText,
  Plus,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
import { chatWorktreeGroupKey } from "@/features/chat/worktree-grouping";

interface PowerWorktreeHistoryPageProps {
  chats: Chat[];
  groupKey: string;
  label: string;
  onArchiveChat: (chat: Chat) => void;
  onNewChat: () => void;
  onOpenChat: (chat: Chat) => void;
  projectPath?: string;
}

export function PowerWorktreeHistoryPage({
  chats,
  groupKey,
  label,
  onArchiveChat,
  onNewChat,
  onOpenChat,
  projectPath,
}: PowerWorktreeHistoryPageProps): ReactElement {
  const { t } = useTranslation();
  const historyChats = useMemo(() => {
    if (projectPath === undefined) return [];

    return chats
      .filter(
        (chat) =>
          !chat.archived &&
          chatWorktreeGroupKey(chat, projectPath) === groupKey,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }, [chats, groupKey, projectPath]);

  return (
    <div
      className="
      flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6
    "
    >
      <div className="w-full max-w-md">
        {historyChats.length > 0 ? (
          <h2
            className="
            mb-5 truncate text-center text-2xl font-semibold text-foreground
          "
          >
            {label}
          </h2>
        ) : null}
        <div className="h-80 overflow-y-auto">
          {historyChats.length === 0 ? (
            <div
              className="
              flex h-full flex-col items-center justify-center gap-2 text-sm
              text-muted-foreground
            "
            >
              <ChatCircleText className="size-10" weight="duotone" />
              <span>{t("sidebar.noChats")}</span>
              <Button className="mt-2" onClick={onNewChat} size="sm">
                <Plus />
                {t("workspace.newChat")}
              </Button>
            </div>
          ) : (
            <div className="grid gap-1">
              {historyChats.map((chat) => (
                <div
                  className="
                    group/history-chat flex min-w-0 items-center gap-1
                    rounded-md transition-colors
                    hover:bg-muted/55
                    focus-visible:bg-muted/55
                  "
                  key={chat.id}
                  title={chat.title}
                >
                  <button
                    className="
                      flex min-w-0 flex-1 items-center justify-between gap-3
                      rounded-md px-3 py-2 text-left outline-hidden
                      focus-visible:bg-muted/55
                    "
                    onClick={() => onOpenChat(chat)}
                    type="button"
                  >
                    <AgentIcon runtime={chat.runtime} />
                    <span
                      className="
                      max-w-full min-w-0 flex-1 truncate text-sm text-foreground
                    "
                    >
                      {displayChatTitle(chat.title, t)}
                    </span>
                    <span
                      className="shrink-0 text-xs text-muted-foreground"
                      title={formatDateTime(chat.updatedAt)}
                    >
                      {formatRelativeTime(chat.updatedAt)}
                    </span>
                  </button>
                  <Button
                    aria-label={t("sidebar.archiveChat")}
                    className="mr-1 size-7 shrink-0"
                    onClick={() => onArchiveChat(chat)}
                    size="icon-sm"
                    title={t("sidebar.archiveChat")}
                    type="button"
                    variant="ghost"
                  >
                    <Archive className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
            flex size-3 items-center justify-center text-muted-foreground
            [&_svg]:block [&_svg]:size-3 [&_svg]:shrink-0
          "
          // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          dangerouslySetInnerHTML={{ __html: runtimeIconSvg }}
        />
      ) : (
        <Bot className="size-3 text-muted-foreground" />
      )}
    </span>
  );
}

function displayChatTitle(
  title: string,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return title === "New chat" ? t("workspace.newChat") : title;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;

  const elapsedSeconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(elapsedSeconds);
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  });

  if (absoluteSeconds < 60) return formatter.format(elapsedSeconds, "second");

  const elapsedMinutes = Math.round(elapsedSeconds / 60);
  if (Math.abs(elapsedMinutes) < 60) {
    return formatter.format(elapsedMinutes, "minute");
  }

  const elapsedHours = Math.round(elapsedMinutes / 60);
  if (Math.abs(elapsedHours) < 24) {
    return formatter.format(elapsedHours, "hour");
  }

  const elapsedDays = Math.round(elapsedHours / 24);
  if (Math.abs(elapsedDays) < 7) {
    return formatter.format(elapsedDays, "day");
  }

  const elapsedWeeks = Math.round(elapsedDays / 7);
  if (Math.abs(elapsedWeeks) < 5) {
    return formatter.format(elapsedWeeks, "week");
  }

  const elapsedMonths = Math.round(elapsedDays / 30);
  if (Math.abs(elapsedMonths) < 12) {
    return formatter.format(elapsedMonths, "month");
  }

  return formatter.format(Math.round(elapsedDays / 365), "year");
}
