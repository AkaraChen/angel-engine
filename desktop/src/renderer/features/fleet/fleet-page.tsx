import type {
  Chat,
  ChatActivity,
  ChatActivityReason,
  ChatActivityStatus,
} from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { ReactElement } from "react";
import type { UsageAvailability } from "@angel-engine/usage-collector/types";
import type {
  FleetGroup,
  FleetRow,
  FleetSegment,
} from "@/features/fleet/fleet-model";

import {
  Robot as Bot,
  MagnifyingGlass as SearchIcon,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { providerUsageAvailability } from "@angel-engine/usage-collector/correlate";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
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
  terminalAttentionId,
} from "@/features/fleet/fleet-model";
import { getApiClient } from "@/platform/api-client";
import { formatDateTime, formatRelativeTime } from "@/platform/format-time";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";
import { usageSnapshotQueryOptions } from "@/features/usage/api/queries";
import { formatEstimatedCost } from "@/features/usage/format";

const EMPTY_ACTIVITIES: never[] = [];

/** Enough rows to read as a list while loading, without faking a full page. */
const SKELETON_ROW_COUNT = 5;

const SEGMENT_LABEL_KEYS: Record<FleetSegment, string> = {
  all: "fleet.segments.all",
  attention: "fleet.segments.attention",
  running: "fleet.segments.running",
  done: "fleet.segments.done",
};

const SEGMENT_EMPTY_KEYS: Record<FleetSegment, string> = {
  all: "fleet.emptySegments.all",
  attention: "fleet.emptySegments.attention",
  running: "fleet.emptySegments.running",
  done: "fleet.emptySegments.done",
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

const REASON_LABEL_KEYS: Record<ChatActivityReason, string> = {
  approval: "fleet.reasons.approval",
  question: "fleet.reasons.question",
  process_exited: "fleet.reasons.processExited",
  runtime_error: "fleet.reasons.runtimeError",
};

/**
 * Status is never colour-only: the dot carries the tone, the label next to it
 * carries the meaning.
 */
const STATUS_TONE: Record<ChatActivityStatus, string> = {
  waiting_for_you: "text-status-attention",
  failed: "text-status-danger",
  stuck: "text-status-danger",
  running: "text-foreground",
  done: "text-muted-foreground",
};

const STATUS_DOT_TONE: Record<ChatActivityStatus, string> = {
  waiting_for_you: "bg-status-attention",
  failed: "bg-status-danger",
  stuck: "bg-status-danger",
  running: "bg-status-success",
  done: "bg-muted-foreground",
};

interface FleetPageProps {
  chats: Chat[];
  /** Chats/projects failed to load; their rows would be missing, not absent. */
  isMetadataError: boolean;
  isMetadataPending: boolean;
  onNewChat: () => void;
  onOpenChat: (chat: Chat) => void;
  projects: Project[];
}

export function FleetPage({
  chats,
  isMetadataError,
  isMetadataPending,
  onNewChat,
  onOpenChat,
  projects,
}: FleetPageProps): ReactElement {
  const { t } = useTranslation();
  const api = getApiClient();
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<FleetSegment>("all");
  const [search, setSearch] = useState("");
  const [requestedProjectFilter, setRequestedProjectFilter] = useState(
    FLEET_PROJECT_FILTER_ALL,
  );
  const activityQuery = useQuery({ ...chatActivityListQueryOptions({ api }) });
  const usageQuery = useQuery(usageSnapshotQueryOptions());
  const activities = activityQuery.data ?? EMPTY_ACTIVITIES;

  /**
   * Opening a finished run is what marks it read. The ack carries the row's own
   * `attentionId`, so a marker that already belongs to a newer run is rejected
   * by the daemon (`read: false`) and refetched instead of silently cleared.
   */
  const { mutate: readTerminalActivity } = useMutation({
    mutationFn: async ({
      attentionId,
      chatId,
    }: {
      attentionId: string;
      chatId: string;
    }) => api.activity.read(chatId, { attentionId }),
    onSuccess: (result, { attentionId, chatId }) => {
      if (!result.read) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chatActivity.all(),
        });
        return;
      }
      queryClient.setQueryData<ChatActivity[]>(
        queryKeys.chatActivity.list(),
        (current) =>
          current?.filter(
            (candidate) =>
              candidate.chatId !== chatId ||
              terminalAttentionId(candidate) !== attentionId,
          ) ?? [],
      );
    },
  });

  const openRow = useCallback(
    (row: FleetRow) => {
      if (row.terminalAttentionId !== undefined) {
        readTerminalActivity({
          attentionId: row.terminalAttentionId,
          chatId: row.chatId,
        });
      }
      onOpenChat(row.chat);
    },
    [onOpenChat, readTerminalActivity],
  );

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
  /**
   * Counts follow the project filter and the search, but never the segment —
   * a badge that changed when you pressed it would be unreadable.
   */
  const scopedRows = useMemo(
    () => filterFleetRows(rows, { projectFilter, search, segment: "all" }),
    [projectFilter, rows, search],
  );
  const counts = useMemo(() => countFleetRows(scopedRows), [scopedRows]);
  const sections = useMemo(
    () =>
      groupFleetRows(
        filterFleetRows(scopedRows, { projectFilter, search, segment }),
      ),
    [projectFilter, scopedRows, search, segment],
  );

  const isPending = activityQuery.isPending || isMetadataPending;
  const isError = activityQuery.isError || isMetadataError;
  const hasSearch = search.trim() !== "";
  // Filtering an empty set is noise — only show the toolbar once there is
  // something to segment, search, or project-filter.
  const showToolbar = rows.length > 0;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-8 py-10">
        <h2 className="pl-6 text-2xl font-semibold text-foreground">
          {t("fleet.title")}
        </h2>

        {showToolbar ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 pl-6">
            <div
              aria-label={t("fleet.filterSegments")}
              className="
                flex items-center gap-0.5 rounded-full bg-surface-1 p-0.5
              "
              role="group"
            >
              {FLEET_SEGMENTS.map((option) => (
                <button
                  aria-pressed={segment === option}
                  className={cn(
                    `
                      flex h-7 items-center gap-1.5 rounded-full px-3 text-xs
                      font-medium transition-colors duration-120 ease-standard
                      outline-none
                      focus-visible:ring-2 focus-visible:ring-ring/50
                      motion-reduce:transition-none
                    `,
                    segment === option
                      ? "bg-card text-foreground shadow-xs"
                      : `
                        text-muted-foreground
                        hover:text-foreground
                      `,
                  )}
                  key={option}
                  onClick={() => setSegment(option)}
                  type="button"
                >
                  <span>{t(SEGMENT_LABEL_KEYS[option])}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {counts[option]}
                  </span>
                </button>
              ))}
            </div>

            <InputGroup className="h-8 w-auto min-w-40 flex-1" variant="search">
              <InputGroupAddon align="inline-start">
                <SearchIcon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  weight="regular"
                />
              </InputGroupAddon>
              <InputGroupInput
                aria-label={t("fleet.search")}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder={t("fleet.search")}
                type="search"
                value={search}
              />
            </InputGroup>

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
          </div>
        ) : null}

        {isPending ? (
          <FleetSkeletonList />
        ) : isError ? (
          <FleetNotice text={t("fleet.disconnected")} />
        ) : sections.length === 0 ? (
          <FleetEmptyState
            onNewChat={onNewChat}
            text={
              hasSearch ? t("fleet.noMatches") : t(SEGMENT_EMPTY_KEYS[segment])
            }
          />
        ) : (
          sections.map((section) => (
            <section className="mt-8" key={section.group}>
              {/* `pl-6` matches the row's, so the heading and the runtime
                  icons below it share one left edge. */}
              <h3
                className="
                  flex items-center gap-2 pr-3 pl-6 font-mono text-[0.6875rem]
                  tracking-wide text-muted-foreground uppercase
                "
              >
                {t(GROUP_LABEL_KEYS[section.group])}
                <span className="tabular-nums">{section.rows.length}</span>
                <span className="ml-auto hidden w-16 text-right lg:block">
                  {t("usage.sessionCost")}
                </span>
                <span className="w-24 shrink-0 text-right">
                  {t("common.updated")}
                </span>
              </h3>
              <div className="mt-1.5 flex flex-col">
                {section.rows.map((row) => (
                  <FleetRowButton
                    key={row.chatId}
                    onOpen={openRow}
                    row={row}
                    usage={usageQuery.data}
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
  onOpen,
  row,
  usage,
}: {
  onOpen: (row: FleetRow) => void;
  row: FleetRow;
  usage?: UsageAvailability;
}): ReactElement {
  const { t } = useTranslation();
  const location = [row.projectName, row.worktreeName]
    .filter((value) => is.nonEmptyString(value))
    .join(" / ");
  // The daemon only ever gives one line of detail per run, so the summary is
  // the failure text when there is one and the reason otherwise.
  const detail = is.nonEmptyString(row.failureMessage)
    ? row.failureMessage
    : row.reason === undefined
      ? undefined
      : t(REASON_LABEL_KEYS[row.reason]);
  const providerUsage = usage
    ? providerUsageAvailability(usage, row.runtime, row.chat.remoteThreadId)
    : undefined;
  const sessionCost =
    providerUsage?.kind === "ok" && providerUsage.session
      ? formatEstimatedCost(providerUsage.session.totalCost)
      : undefined;

  return (
    <button
      className="
        group relative flex w-full min-w-0 items-center gap-2.5 rounded-lg py-2
        pr-3 pl-6 text-left transition-colors duration-120 ease-standard
        outline-none
        hover:bg-overlay-hover
        focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset
        motion-reduce:transition-none
      "
      onClick={() => onOpen(row)}
      title={row.failureMessage ?? row.title}
      type="button"
    >
      {/* The dot hangs in the gutter rather than taking a column, so the
          runtime icon can start on the same edge as the group heading. */}
      <FleetStatusDot status={row.status} />
      <FleetRuntimeIcon runtime={row.runtime} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {row.title}
      </span>
      {/* Location, summary and time are fixed-width columns so the list reads
          down as well as across; an empty cell still holds its slot. */}
      <span
        className="
          hidden w-40 shrink-0 truncate font-mono text-[11px]
          text-muted-foreground
          md:block
        "
      >
        {location}
      </span>
      {/* The status word always renders: the dot's colour is a redundant cue,
          never the only one. */}
      <span className="block w-52 shrink-0 truncate text-xs">
        <span className={STATUS_TONE[row.status]}>
          {t(STATUS_LABEL_KEYS[row.status])}
        </span>
        {is.nonEmptyString(detail) ? (
          <span className="text-muted-foreground"> · {detail}</span>
        ) : null}
      </span>
      {sessionCost ? (
        <span className="hidden w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground lg:block">
          {sessionCost}
        </span>
      ) : null}
      {/* Relative times vary in width across locales, so the column is sized to
          hold the longest of them; `tabular-nums` keeps it from twitching as
          the numbers tick over. */}
      <span
        className="
          w-24 shrink-0 truncate text-right font-mono text-[11px] tabular-nums
          whitespace-nowrap text-muted-foreground
        "
        title={formatDateTime(row.updatedAt)}
      >
        {formatRelativeTime(row.updatedAt)}
      </span>
    </button>
  );
}

function FleetStatusDot({
  status,
}: {
  status: ChatActivityStatus;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full",
        STATUS_DOT_TONE[status],
        status === "running"
          ? `
            animate-[skeleton-breathe_1.6s_ease-in-out_infinite]
            motion-reduce:animate-none
          `
          : undefined,
      )}
    />
  );
}

function FleetEmptyState({
  onNewChat,
  text,
}: {
  onNewChat: () => void;
  text: string;
}): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      className="
        dot-grid mt-8 flex flex-col items-center gap-4 rounded-xl border
        border-border-subtle px-6 py-16 text-center
      "
    >
      <p className="text-sm text-muted-foreground">{text}</p>
      <Button onClick={onNewChat} size="sm" variant="outline">
        {t("workspace.newChat")}
      </Button>
    </div>
  );
}

function FleetSkeletonList(): ReactElement {
  const { t } = useTranslation();

  return (
    <div
      aria-label={t("fleet.loading")}
      className="mt-8 flex flex-col"
      role="status"
    >
      {Array.from({ length: SKELETON_ROW_COUNT }, (_unused, index) => (
        <div
          className="relative flex w-full items-center gap-2.5 py-2 pr-3 pl-6"
          key={index}
        >
          <Skeleton className="absolute top-1/2 left-1.5 size-1.5 -translate-y-1/2 rounded-full" />
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="hidden h-3 w-40 shrink-0 md:block" />
          <Skeleton className="h-3 w-52 shrink-0" />
          <Skeleton className="h-3 w-24 shrink-0" />
        </div>
      ))}
    </div>
  );
}

function FleetNotice({ text }: { text: string }): ReactElement {
  return (
    <div
      className="
        mt-8 rounded-xl border border-border-subtle px-6 py-16 text-center
        text-sm text-muted-foreground
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
            flex size-3.5 items-center justify-center text-muted-foreground
            [&_svg]:block [&_svg]:size-3.5 [&_svg]:shrink-0
          "
          // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          dangerouslySetInnerHTML={{ __html: runtimeIconSvg }}
        />
      ) : (
        <Bot className="size-3.5 text-muted-foreground" weight="regular" />
      )}
    </span>
  );
}
