import type { Chat } from "@shared/chat";
import type { ReactElement } from "react";

import { ChatCircleText, Plus } from "@phosphor-icons/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { chatWorktreeGroupKey } from "@/features/chat/worktree-grouping";

interface PowerWorktreeHistoryPageProps {
  chats: Chat[];
  groupKey: string;
  label: string;
  onNewChat: () => void;
  onOpenChat: (chat: Chat) => void;
  projectPath?: string;
}

export function PowerWorktreeHistoryPage({
  chats,
  groupKey,
  label,
  onNewChat,
  onOpenChat,
  projectPath,
}: PowerWorktreeHistoryPageProps): ReactElement {
  const { t } = useTranslation();
  const historyChats = useMemo(
    () => {
      if (projectPath === undefined) return [];

      return chats
        .filter(
          (chat) =>
            !chat.archived &&
            chatWorktreeGroupKey(chat, projectPath) === groupKey,
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    },
    [chats, groupKey, projectPath],
  );

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md">
        {historyChats.length > 0 ? (
          <h2 className="mb-5 truncate text-center text-2xl font-semibold text-foreground">
            {label}
          </h2>
        ) : null}
        <div className="h-80 overflow-y-auto">
          {historyChats.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
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
                <button
                  className="
                    flex min-w-0 items-center justify-between gap-3 rounded-md
                    px-3 py-2 text-left transition-colors
                    hover:bg-muted/55 focus-visible:bg-muted/55
                    focus-visible:outline-hidden
                  "
                  key={chat.id}
                  onClick={() => onOpenChat(chat)}
                  title={chat.title}
                  type="button"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {displayChatTitle(chat.title, t)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateTime(chat.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
