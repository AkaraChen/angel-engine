import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";

import { Robot as Bot } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  displayChatTitle,
  getProjectDisplayName,
} from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
import { formatDateTime, formatRelativeTime } from "@/platform/format-time";

/** Enough to recognise where you left off; more than this becomes a sidebar. */
const RECENT_CHAT_LIMIT = 4;

export function NewChatRecentSection({
  chats,
  isProjectMode,
  onCreateProject,
  onOpenChat,
  projects,
}: {
  chats: Chat[];
  isProjectMode: boolean;
  onCreateProject: () => void;
  onOpenChat: (chat: Chat) => void;
  projects: Project[];
}): ReactElement | null {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const projectPaths = useMemo(
    () => new Map(projects.map((project) => [project.id, project.path])),
    [projects],
  );
  const allRecentChats = useMemo(
    () =>
      chats
        .filter((chat) => !chat.archived)
        .toSorted((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        ),
    [chats],
  );
  const recentChats = expanded
    ? allRecentChats
    : allRecentChats.slice(0, RECENT_CHAT_LIMIT);
  const hiddenCount = allRecentChats.length - RECENT_CHAT_LIMIT;

  if (recentChats.length === 0 && !isProjectMode) return null;

  return (
    <section className="mt-10 w-full">
      <h3
        className="
          px-1 pb-2 font-mono text-[11px] tracking-[0.06em] text-muted-foreground
          uppercase
        "
      >
        {t("thread.empty.recentTitle")}
      </h3>
      {recentChats.length === 0 ? (
        <div
          className="
            flex flex-col items-center gap-3 rounded-xl px-6 py-8 text-center
          "
        >
          <p className="text-sm text-muted-foreground">
            {t("thread.empty.recentEmpty")}
          </p>
          <Button onClick={onCreateProject} size="sm" variant="outline">
            {t("workspace.newProject")}
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {recentChats.map((chat) => (
              <li key={chat.id}>
                <RecentChatCard
                  chat={chat}
                  onOpen={() => onOpenChat(chat)}
                  projectPath={
                    is.nonEmptyString(chat.projectId)
                      ? projectPaths.get(chat.projectId)
                      : undefined
                  }
                />
              </li>
            ))}
          </ul>
          {hiddenCount > 0 ? (
            <div className="mt-2 flex justify-center">
              <Button
                onClick={() => setExpanded((current) => !current)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {expanded
                  ? t("thread.empty.recentShowLess")
                  : t("thread.empty.recentShowAll", {
                      count: allRecentChats.length,
                    })}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RecentChatCard({
  chat,
  onOpen,
  projectPath,
}: {
  chat: Chat;
  onOpen: () => void;
  projectPath?: string;
}): ReactElement {
  const { t } = useTranslation();
  // The chat cwd is the worktree it actually runs in, so it carries more than
  // the project root does; the project path is only the fallback.
  const location = is.nonEmptyString(chat.cwd) ? chat.cwd : projectPath;

  return (
    <button
      className="
        flex w-full min-w-0 items-center gap-3 rounded-xl border
        border-border-subtle bg-card px-3.5 py-2.5 text-left shadow-xs
        transition-colors duration-120 ease-standard outline-none
        hover:border-border-strong
        focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
        focus-visible:ring-offset-background
        motion-reduce:transition-none
      "
      onClick={onOpen}
      title={chat.title}
      type="button"
    >
      <RuntimeIcon runtime={chat.runtime} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {displayChatTitle(chat.title, t)}
        </span>
        {is.nonEmptyString(location) ? (
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            {getProjectDisplayName(location)}
          </span>
        ) : null}
      </span>
      <span
        className="shrink-0 text-right text-xs tabular-nums text-muted-foreground"
        title={formatDateTime(chat.updatedAt)}
      >
        {formatRelativeTime(chat.updatedAt)}
      </span>
    </button>
  );
}

function RuntimeIcon({ runtime }: { runtime?: string | null }): ReactElement {
  const runtimeIconSvg = agentRuntimeIconSvg(runtime);

  return (
    <span
      className="flex size-5 shrink-0 items-center justify-center"
      title={agentRuntimeLabel(runtime)}
    >
      {is.nonEmptyString(runtimeIconSvg) ? (
        <span
          aria-hidden="true"
          className="
            flex size-4 items-center justify-center text-muted-foreground
            [&_svg]:block [&_svg]:size-4 [&_svg]:shrink-0
          "
          // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          dangerouslySetInnerHTML={{ __html: runtimeIconSvg }}
        />
      ) : (
        <Bot className="size-4 text-muted-foreground" weight="regular" />
      )}
    </span>
  );
}
