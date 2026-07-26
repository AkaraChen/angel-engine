import type { Chat, ChatActivityStatus } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";
import type {
  FleetGroup,
  FleetRow,
  FleetSegment,
} from "@/features/fleet/fleet-model";

import { Robot as Bot } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  agentRuntimeIconSvg,
  agentRuntimeLabel,
} from "@/features/agents/agent-runtime-icons";
import { chatActivityListQueryOptions } from "@/features/fleet/api/queries";
import {
  buildFleetRows,
  countFleetRows,
  filterFleetRows,
  FLEET_PROJECT_FILTER_ALL,
  FLEET_SEGMENTS,
  fleetProjectOptions,
  groupFleetRows,
  resolveFleetProjectFilter,
} from "@/features/fleet/fleet-model";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { getApiClient } from "@/platform/api-client";
import { formatDateTime, formatRelativeTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

const EMPTY_ACTIVITIES: never[] = [];

const SEGMENT_LABEL_KEYS: Record<FleetSegment, string> = {
  all: "fleet.segments.all",
  attention: "fleet.segments.attention",
  running: "fleet.segments.running",
  done: "fleet.segments.done",
};

const GROUP_LABEL_KEYS: Record<FleetGroup, string> = {
  attention: "fleet.groups.attention",
  running: "fleet.groups.running",
  done: "fleet.groups.done",
};

const STATUS_LABEL_KEYS: Record<ChatActivityStatus, string> = {
  waiting_for_you: "fleet.status.waitingForYou",
  failed: "fleet.status.failed",
  stuck: "fleet.status.stuck",
  running: "fleet.status.running",
  done: "fleet.status.done",
};

/**
 * Status is never colour-only: the text label carries the meaning and the tone
 * is a redundant cue.
 */
const STATUS_TONE: Record<ChatActivityStatus, string> = {
  waiting_for_you: "text-status-attention",
  failed: "text-status-danger",
  stuck: "text-status-danger",
  running: "text-foreground",
  done: "text-status-success",
};

interface FleetPageProps {
  chats: Chat[];
  onOpenChat: (chat: Chat) => void;
  projects: Project[];
}

export function FleetPage({
  chats,
  onOpenChat,
  projects,
}: FleetPageProps): ReactElement {
  const { t } = useTranslation();
  const api = getApiClient();
  const [segment, setSegment] = useState<FleetSegment>("all");
  const [requestedProjectFilter, setRequestedProjectFilter] = useState(
    FLEET_PROJECT_FILTER_ALL,
  );
  const activityQuery = useQuery({ ...chatActivityListQueryOptions({ api }) });
  const activities = activityQuery.data ?? EMPTY_ACTIVITIES;

  const rows = useMemo(
    () => buildFleetRows({ activities, chats, projects }),
    [activities, chats, projects],
  );
  const projectOptions = useMemo(
    () =>
      fleetProjectOptions(rows, {
        allProjects: t("fleet.allProjects"),
        standalone: t("fleet.standaloneProject"),
      }),
    [rows, t],
  );
  const projectFilter = resolveFleetProjectFilter(
    requestedProjectFilter,
    projectOptions,
  );
  const projectRows = useMemo(
    () => filterFleetRows(rows, { projectFilter, segment: "all" }),
    [projectFilter, rows],
  );
  const counts = useMemo(() => countFleetRows(projectRows), [projectRows]);
  const sections = useMemo(
    () =>
      groupFleetRows(filterFleetRows(projectRows, { projectFilter, segment })),
    [projectFilter, projectRows, segment],
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-8 py-10">
        <header className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto text-2xl font-semibold text-foreground">
            {t("fleet.title")}
          </h2>
          <div
            aria-label={t("fleet.filterSegments")}
            className="
              flex items-center gap-0.5 rounded-md bg-black/5.5 p-0.5
              dark:bg-white/5.5
            "
            role="group"
          >
            {FLEET_SEGMENTS.map((option) => (
              <button
                aria-pressed={segment === option}
                className={cn(
                  `
                    flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs
                    font-medium text-muted-foreground outline-none
                    focus-visible:ring-2 focus-visible:ring-ring/50
                  `,
                  segment === option
                    ? `
                      bg-white/70 text-foreground shadow-xs
                      dark:bg-white/[0.14]
                    `
                    : "hover:text-foreground",
                )}
                key={option}
                onClick={() => setSegment(option)}
                type="button"
              >
                <span>{t(SEGMENT_LABEL_KEYS[option])}</span>
                <span className="tabular-nums opacity-70">
                  {counts[option]}
                </span>
              </button>
            ))}
          </div>
          {projectOptions.length > 1 ? (
            <NativeSelect
              aria-label={t("fleet.filterProject")}
              onChange={(event) =>
                setRequestedProjectFilter(event.currentTarget.value)
              }
              size="sm"
              value={projectFilter}
            >
              {projectOptions.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          ) : null}
        </header>

        {activityQuery.isPending ? (
          <FleetNotice text={t("fleet.loading")} />
        ) : activityQuery.isError ? (
          <FleetNotice text={t("fleet.disconnected")} />
        ) : sections.length === 0 ? (
          <FleetNotice text={t("fleet.empty")} />
        ) : (
          sections.map((section) => (
            <section key={section.group}>
              <h3
                className="
                  mt-8 pl-1 text-xs font-medium tracking-wide
                  text-muted-foreground
                "
              >
                {t(GROUP_LABEL_KEYS[section.group])}
              </h3>
              <div
                className="
                  mt-2 space-y-px overflow-hidden rounded-xl border
                  border-border-subtle bg-card p-1.5 shadow-xs
                "
              >
                {section.rows.map((row) => (
                  <FleetRowButton
                    key={row.chatId}
                    onOpenChat={onOpenChat}
                    row={row}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function FleetRowButton({
  onOpenChat,
  row,
}: {
  onOpenChat: (chat: Chat) => void;
  row: FleetRow;
}): ReactElement {
  const { t } = useTranslation();
  const meta = [row.projectName, row.worktreeName].filter((value) =>
    is.nonEmptyString(value),
  );

  return (
    <button
      className="
        flex w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left
        outline-none
        hover:bg-muted/50
        focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset
      "
      onClick={() => onOpenChat(row.chat)}
      title={row.failureMessage ?? row.title}
      type="button"
    >
      <FleetRuntimeIcon runtime={row.runtime} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {row.title}
      </span>
      {meta.length > 0 ? (
        <span className="hidden min-w-0 shrink truncate text-xs text-muted-foreground md:block">
          {meta.join(" · ")}
        </span>
      ) : null}
      <span
        className={cn("shrink-0 text-xs font-medium", STATUS_TONE[row.status])}
      >
        {t(STATUS_LABEL_KEYS[row.status])}
      </span>
      <span
        className="w-16 shrink-0 text-right text-xs text-muted-foreground"
        title={formatDateTime(row.updatedAt)}
      >
        {formatRelativeTime(row.updatedAt)}
      </span>
    </button>
  );
}

function FleetNotice({ text }: { text: string }): ReactElement {
  return (
    <div
      className="
        mt-8 rounded-xl bg-surface-1/50 px-6 py-16 text-center text-sm
        text-muted-foreground
      "
    >
      {text}
    </div>
  );
}

function FleetRuntimeIcon({ runtime }: { runtime: string }): ReactElement {
  const runtimeIconSvg = agentRuntimeIconSvg(runtime);

  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center"
      title={agentRuntimeLabel(runtime)}
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
