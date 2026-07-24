import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ReactElement } from "react";

import {
  Archive,
  Robot as Bot,
  ChatCircleText,
  Plus,
  PushPin,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildWorkspaceToolPatchList,
  getWorkspaceToolPatchFileLineChanges,
} from "@/app/workspace/workspace-tool-patch-model";
import { Button } from "@/components/ui/button";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
import {
  chatWorktreeCwd,
  chatWorktreeGroupKey,
} from "@/features/chat/worktree-grouping";
import { sortChatsPinnedFirst } from "@/features/chat/chat-order";
import { workspaceToolRootName } from "@/app/workspace/workspace-file-display";
import { getApiClient } from "@/platform/api-client";
import { queryKeys } from "@/platform/query-keys";

interface PowerWorktreeHistoryPageProps {
  chats: Chat[];
  groupKey: string;
  label: string;
  onArchiveChat: (chat: Chat) => void;
  onNewChat: () => void;
  onOpenChat: (chat: Chat) => void;
  onShowChatContextMenu: (chat: Chat) => void;
  projectPath?: string;
}

export function PowerWorktreeHistoryPage({
  chats,
  groupKey,
  label,
  onArchiveChat,
  onNewChat,
  onOpenChat,
  onShowChatContextMenu,
  projectPath,
}: PowerWorktreeHistoryPageProps): ReactElement {
  const { t } = useTranslation();
  const historyChats = useMemo(() => {
    if (projectPath === undefined) return [];

    return sortChatsPinnedFirst(
      chats.filter(
        (chat) =>
          !chat.archived &&
          chatWorktreeGroupKey(chat, projectPath) === groupKey,
      ),
    );
  }, [chats, groupKey, projectPath]);
  const latestChat = historyChats.reduce<Chat | undefined>(
    (latest, chat) =>
      latest === undefined || chat.updatedAt > latest.updatedAt ? chat : latest,
    undefined,
  );
  const worktreeRoot =
    latestChat !== undefined
      ? (chatWorktreeCwd(latestChat, projectPath) ?? projectPath)
      : projectPath;
  const gitStats = usePowerWorktreeGitStats(worktreeRoot);
  const worktreeName = is.nonEmptyString(worktreeRoot)
    ? workspaceToolRootName(worktreeRoot)
    : undefined;
  const pageTitle = is.nonEmptyString(worktreeName) ? worktreeName : label;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-8 py-10">
        <header className="flex items-center gap-4">
          <h2
            className="
              min-w-0 flex-1 truncate text-2xl font-semibold text-foreground
            "
            title={pageTitle}
          >
            {pageTitle}
          </h2>
          <Button onClick={onNewChat} size="sm" variant="soft">
            <Plus />
            {t("workspace.newChat")}
          </Button>
        </header>
        <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <PowerWorktreeStat
            label={t("sidebar.chats")}
            value={historyChats.length.toLocaleString()}
          />
          <PowerWorktreeStat
            label={t("workspace.statsLastActive")}
            title={
              latestChat ? formatDateTime(latestChat.updatedAt) : undefined
            }
            value={latestChat ? formatRelativeTime(latestChat.updatedAt) : "—"}
          />
          <PowerWorktreeStat
            label={t("workspace.statsBranch")}
            title={gitStats?.branch}
            value={gitStats?.branch ?? "—"}
          />
          <PowerWorktreeStat
            label={t("workspace.statsChanges")}
            value={
              gitStats === undefined ? (
                "—"
              ) : gitStats.changedFiles === 0 ? (
                "0"
              ) : (
                <span className="flex items-baseline gap-2 tabular-nums">
                  <span>{gitStats.changedFiles.toLocaleString()}</span>
                  {gitStats.additions > 0 ? (
                    <span className="text-xs font-medium text-status-success">
                      +{gitStats.additions.toLocaleString()}
                    </span>
                  ) : null}
                  {gitStats.deletions > 0 ? (
                    <span className="text-xs font-medium text-status-danger">
                      -{gitStats.deletions.toLocaleString()}
                    </span>
                  ) : null}
                </span>
              )
            }
          />
        </dl>
        <h3
          className="
            mt-8 pl-1 text-xs font-medium tracking-wide text-muted-foreground
          "
        >
          {label}
        </h3>
        {historyChats.length === 0 ? (
          <div
            className="
              mt-2 flex flex-col items-center justify-center gap-1 rounded-xl
              bg-surface-1/50 px-6 py-16 text-center
            "
          >
            <ChatCircleText
              aria-hidden="true"
              className="mb-1 size-8 text-muted-foreground/60"
              weight="duotone"
            />
            <span className="text-sm font-medium text-foreground">
              {t("sidebar.noChats")}
            </span>
            <Button className="mt-3" onClick={onNewChat} size="sm">
              <Plus />
              {t("workspace.newChat")}
            </Button>
          </div>
        ) : (
          <div
            className="
              mt-2 space-y-px overflow-hidden rounded-xl border
              border-border-subtle bg-card p-1.5 shadow-xs
            "
          >
            {historyChats.map((chat) => (
              <div
                className="
                  group/history-chat flex min-w-0 items-center gap-1 rounded-lg
                "
                key={chat.id}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onShowChatContextMenu(chat);
                }}
                title={chat.title}
              >
                <button
                  className="
                    flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2
                    text-left outline-none
                    focus-visible:ring-2 focus-visible:ring-ring/50
                    focus-visible:ring-inset
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
                  {chat.pinned ? (
                    <PushPin
                      aria-label={t("sidebar.dateGroups.pinned")}
                      className="size-3 shrink-0 text-muted-foreground"
                      weight="fill"
                    />
                  ) : null}
                  <span
                    className="shrink-0 text-xs text-muted-foreground"
                    title={formatDateTime(chat.updatedAt)}
                  >
                    {formatRelativeTime(chat.updatedAt)}
                  </span>
                </button>
                <Button
                  aria-label={t("sidebar.archiveChat")}
                  className="
                    mr-1.5 size-7 shrink-0 opacity-0 transition-opacity
                    group-focus-within/history-chat:opacity-100
                    group-hover/history-chat:opacity-100
                    motion-reduce:transition-none
                  "
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
  );
}

interface PowerWorktreeGitStats {
  additions: number;
  branch?: string;
  changedFiles: number;
  deletions: number;
}

function usePowerWorktreeGitStats(
  root: string | undefined,
): PowerWorktreeGitStats | undefined {
  const api = getApiClient();
  const hasRoot = is.nonEmptyString(root);
  const gitQuery = useQuery({
    enabled: hasRoot,
    queryFn: async () => {
      if (!hasRoot) {
        throw new Error("Worktree git stats query requires a root.");
      }
      return api.workspaceTools.gitDiff({ root });
    },
    queryKey: queryKeys.workspaceTools.gitDiff(hasRoot ? root : ""),
    retry: false,
    select: (data): PowerWorktreeGitStats | undefined => {
      if (!data.isGitRepository) {
        return undefined;
      }

      const patchList = buildWorkspaceToolPatchList(
        data.stagedPatch,
        data.unstagedPatch,
        data.skippedFiles,
      );
      let additions = 0;
      let deletions = 0;
      for (const file of patchList.files) {
        const lineChanges = getWorkspaceToolPatchFileLineChanges(file);
        additions += lineChanges.additions;
        deletions += lineChanges.deletions;
      }

      return {
        additions,
        branch: data.branch,
        changedFiles: patchList.files.length,
        deletions,
      };
    },
    staleTime: 5_000,
  });

  return gitQuery.data;
}

function PowerWorktreeStat({
  label,
  title,
  value,
}: {
  label: string;
  title?: string;
  value: ReactElement | string;
}): ReactElement {
  return (
    <div className="min-w-0 rounded-lg bg-surface-1/50 px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd
        className="
          mt-0.5 truncate text-sm font-medium text-foreground tabular-nums
        "
        title={title}
      >
        {value}
      </dd>
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
