import type { DaemonErrorCode } from "@angel-engine/daemon-api/daemon";
import type { ResolvedTaskLink } from "@angel-engine/daemon-api/links";
import type {
  ChangeRequest,
  WorkItem,
} from "@angel-engine/daemon-api/source-control";
import type { FC } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import {
  GitPullRequest,
  GitBranch,
  Record as RecordIcon,
  SpinnerGap,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  sourceControlChangeRequestsQueryOptions,
  sourceControlWorkItemsQueryOptions,
  taskLinkResolveQueryOptions,
} from "@/features/chat/api/queries";
import type { ComposerSourceControlAttachment } from "@/features/chat/components/composer/source-control-attachments";
import {
  changeRequestAttachment,
  resolvedTaskLinkAttachment,
  workItemAttachment,
} from "@/features/chat/components/composer/source-control-attachments";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import { useSourceControlActivation } from "@/features/source-control/api/use-activation";
import { CapabilityGate } from "@/features/source-control/components/capability-gate";
import { capabilityState } from "@/features/source-control/model";
import { appLocale } from "@/platform/format-time";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

type PromptSourceControlAttachButtonProps = {
  disabled?: boolean;
  onAttached: (attachment: ComposerSourceControlAttachment) => void;
};

const SEARCH_DEBOUNCE_MS = 250;
const ITEM_LIMIT = 30;
const TASK_LINK_URL_PATTERN =
  /^https:\/\/(?:(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/\d+|linear\.app\/[^/\s]+\/issue\/[A-Za-z][A-Za-z0-9]*-\d+(?:\/[^\s]*)?)/;

export const PromptSourceControlAttachButton: FC<
  PromptSourceControlAttachButtonProps
> = ({ disabled = false, onAttached }) => {
  const { t } = useTranslation();
  const api = useApi();
  const environment = useChatEnvironment();
  const activation = useSourceControlActivation(environment.projectId);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [attachError, setAttachError] = useState<{
    message: string;
    url: string;
  } | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [errorsVisible, setErrorsVisible] = useState(false);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const activeRequestId = useRef(0);

  useEffect(
    () => () => {
      activeRequestId.current += 1;
    },
    [],
  );

  const directUrl = TASK_LINK_URL_PATTERN.test(debouncedSearch.trim())
    ? debouncedSearch.trim()
    : null;
  const localHint =
    directUrl === null ? taskLinkLocalHint(debouncedSearch, t) : null;
  const isUrlLike = /^https?:\/\//i.test(debouncedSearch.trim());
  const workItemsCapability = capabilityState(
    activation.capabilities,
    "workItems.list",
  );
  const changeRequestsCapability = capabilityState(
    activation.capabilities,
    "changeRequests.list",
  );
  const providerActive =
    activation.status === "active" &&
    is.nonEmptyString(activation.projectPath) &&
    is.nonEmptyString(activation.providerIdentity);
  const canBrowse =
    providerActive &&
    (workItemsCapability.supported || changeRequestsCapability.supported);
  const workItemsQuery = useQuery(
    sourceControlWorkItemsQueryOptions({
      api,
      enabled:
        open && !isUrlLike && providerActive && workItemsCapability.supported,
      limit: ITEM_LIMIT,
      projectPath: activation.projectPath,
      providerIdentity: activation.providerIdentity,
      query: directUrl === null ? debouncedSearch : "",
    }),
  );
  const changeRequestsQuery = useQuery(
    sourceControlChangeRequestsQueryOptions({
      api,
      enabled:
        open &&
        !isUrlLike &&
        providerActive &&
        changeRequestsCapability.supported,
      limit: ITEM_LIMIT,
      projectPath: activation.projectPath,
      providerIdentity: activation.providerIdentity,
      query: directUrl === null ? debouncedSearch : "",
    }),
  );
  const directItemQuery = useQuery(
    taskLinkResolveQueryOptions({
      api,
      enabled: open && canBrowse,
      url: directUrl,
    }),
  );

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setOpen(true);
      return;
    }

    activeRequestId.current += 1;
    setOpen(false);
    setSearch("");
    setAttachError(null);
    setPendingUrl(null);
    setErrorsVisible(false);
  };

  const attachResolved = (resolved: ResolvedTaskLink) => {
    onAttached(resolvedTaskLinkAttachment(resolved));
    handleOpenChange(false);
  };

  const attachUrl = async (url: string) => {
    if (!canBrowse || is.nonEmptyString(pendingUrl)) return;

    const requestId = activeRequestId.current + 1;
    activeRequestId.current = requestId;
    setPendingUrl(url);
    setAttachError(null);
    try {
      const resolved = await api.links.resolve({ url });
      if (activeRequestId.current !== requestId) return;

      attachResolved(resolved);
    } catch (cause) {
      if (activeRequestId.current !== requestId) return;

      setPendingUrl(null);
      setAttachError({ message: taskLinkErrorMessage(cause, t), url });
    }
  };

  const workItems =
    canBrowse && workItemsCapability.supported
      ? (workItemsQuery.data ?? [])
      : [];
  const changeRequests =
    canBrowse && changeRequestsCapability.supported
      ? (changeRequestsQuery.data ?? [])
      : [];
  const queryError =
    directUrl === null
      ? ((workItemsCapability.supported ? workItemsQuery.error : null) ??
        (changeRequestsCapability.supported ? changeRequestsQuery.error : null))
      : directItemQuery.error;
  const needsLinearAuth =
    queryError instanceof DaemonRequestError &&
    queryError.code === "linear-token-missing";
  const visibleQueryError = errorsVisible ? queryError : null;
  const localHintIsError = errorsVisible && localHint !== null;
  const errorMessage =
    attachError?.message ??
    (visibleQueryError === null || needsLinearAuth
      ? null
      : taskLinkErrorMessage(visibleQueryError, t));
  const directItem =
    !canBrowse || directUrl === null || directItemQuery.data?.url !== directUrl
      ? null
      : directItemQuery.data;
  const showLoading =
    (workItemsCapability.supported &&
      workItemsQuery.isFetching &&
      workItemsQuery.data === undefined) ||
    (changeRequestsCapability.supported &&
      changeRequestsQuery.isFetching &&
      changeRequestsQuery.data === undefined);
  const hasProject = is.nonEmptyString(environment.projectId);
  const showEmpty =
    !workItemsQuery.isFetching &&
    !changeRequestsQuery.isFetching &&
    workItems.length === 0 &&
    changeRequests.length === 0 &&
    directUrl === null &&
    localHint === null &&
    !is.nonEmptyString(errorMessage);

  if (!hasProject) return null;

  const gateCapability = changeRequestsCapability.supported
    ? "changeRequests.list"
    : "workItems.list";
  const trigger = (
    <Button
      className="focus-visible:ring-0!"
      disabled={disabled}
      onClick={() => handleOpenChange(true)}
      size="icon-sm"
      title={t("composer.fromLink")}
      type="button"
      variant="ghost"
    >
      <GitBranch weight="duotone" />
      <span className="sr-only">{t("composer.fromLink")}</span>
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {canBrowse ? (
        trigger
      ) : (
        <CapabilityGate
          capabilities={activation.capabilities}
          capability={gateCapability}
          onRemediate={() => void activation.refetch()}
          remediationLabel={t("common.retry")}
        >
          {trigger}
        </CapabilityGate>
      )}
      <DialogContent
        aria-describedby={undefined}
        className="gap-3 overflow-hidden rounded-2xl p-0 sm:max-w-lg"
      >
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{t("composer.fromLink")}</DialogTitle>
        </DialogHeader>
        <Command className="bg-transparent" shouldFilter={false}>
          <CommandInput
            autoFocus
            className="px-2"
            onBlur={() => setErrorsVisible(true)}
            onFocus={() => setErrorsVisible(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter") setErrorsVisible(true);
            }}
            onValueChange={(value) => {
              setErrorsVisible(false);
              setAttachError(null);
              setSearch(value);
            }}
            placeholder={t("composer.fromLinkPlaceholder")}
            value={search}
          />
          {directUrl === null ? null : (
            <PastedUrlPreview
              item={directItem}
              loading={directItemQuery.isFetching}
              onAttach={attachResolved}
              url={directUrl}
            />
          )}
          {localHint === null ? null : (
            <p
              className={cn(
                "px-4 pt-3 text-xs",
                localHintIsError ? "text-destructive" : "text-muted-foreground",
              )}
              role={localHintIsError ? "alert" : undefined}
            >
              {localHint}
            </p>
          )}
          {needsLinearAuth ? (
            <div className="mx-2 mt-2 flex items-center gap-3 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2">
              <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                {t("composer.linearConnectDescription")}
              </span>
              <Button
                onClick={() => window.desktopWindow.openSettings()}
                size="sm"
                type="button"
              >
                {t("composer.linearConnectAction")}
              </Button>
            </div>
          ) : null}
          <CommandList className="max-h-80 px-1 pt-2 pb-2">
            {is.nonEmptyString(errorMessage) ? (
              <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-sm text-destructive">
                <p>{errorMessage}</p>
                {attachError === null && visibleQueryError === null ? null : (
                  <Button
                    onClick={() => {
                      if (!canBrowse) return;
                      if (attachError !== null) {
                        void attachUrl(attachError.url);
                        return;
                      }
                      void (directUrl === null
                        ? Promise.all([
                            workItemsCapability.supported
                              ? workItemsQuery.refetch()
                              : Promise.resolve(),
                            changeRequestsCapability.supported
                              ? changeRequestsQuery.refetch()
                              : Promise.resolve(),
                          ])
                        : directItemQuery.refetch());
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {t("common.retry")}
                  </Button>
                )}
              </div>
            ) : null}
            {showLoading && !is.nonEmptyString(errorMessage) ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t("composer.attachGitHubLoading")}
              </p>
            ) : null}
            {showEmpty ? (
              <CommandEmpty className="text-muted-foreground">
                {t("composer.attachGitHubEmpty")}
              </CommandEmpty>
            ) : null}
            {changeRequests.map((item) => (
              <SourceControlItemRow
                item={item}
                key={`change-request-${item.id}`}
                onSelect={() => {
                  onAttached(
                    changeRequestAttachment(
                      item,
                      activation.providerDisplayName ??
                        activation.providerId ??
                        "Source control",
                    ),
                  );
                  handleOpenChange(false);
                }}
              />
            ))}
            {workItems.map((item) => (
              <SourceControlItemRow
                item={item}
                key={`work-item-${item.id}`}
                onSelect={() => {
                  onAttached(
                    workItemAttachment(
                      item,
                      activation.providerDisplayName ??
                        activation.providerId ??
                        "Source control",
                    ),
                  );
                  handleOpenChange(false);
                }}
              />
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

function taskLinkLocalHint(
  raw: string,
  t: (key: string) => string,
): string | null {
  const value = raw.trim();
  if (value.length === 0) return null;
  if (!/^https?:\/\//i.test(value)) return t("composer.taskLinkHintSupported");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return t("composer.taskLinkHintComplete");
  }
  const host = url.hostname.toLowerCase();
  if (host === "github.com" || host === "www.github.com") {
    return t("composer.taskLinkHintGitHubPath");
  }
  if (host === "linear.app") {
    return t("composer.taskLinkHintLinearPath");
  }
  return t("composer.taskLinkHintSupported");
}

type SourceControlRowItem = ChangeRequest | WorkItem;

const previewCardClassName =
  "mx-2 mt-2 flex items-center gap-2.5 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2";

function PastedUrlPreview({
  item,
  loading,
  onAttach,
  url,
}: {
  item: ResolvedTaskLink | null;
  loading: boolean;
  onAttach: (item: ResolvedTaskLink) => void;
  url: string;
}) {
  const { t } = useTranslation();

  if (item === null) {
    return (
      <div
        className={cn(previewCardClassName, "text-sm text-muted-foreground")}
      >
        <GitBranch className="size-4 shrink-0" weight="duotone" />
        <span className="min-w-0 flex-1 truncate">{url}</span>
        {loading ? (
          <SpinnerGap className="size-4 shrink-0 animate-spin" />
        ) : null}
      </div>
    );
  }

  return (
    <div className={previewCardClassName}>
      {item.provider === "github" ? (
        item.kind === "pullRequest" ? (
          <GitPullRequest className="size-4 shrink-0" weight="duotone" />
        ) : (
          <RecordIcon className="size-4 shrink-0" weight="duotone" />
        )
      ) : (
        <RecordIcon
          className="size-4 shrink-0 text-violet-500"
          weight="duotone"
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{item.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {item.provider === "github"
            ? legacyGitHubItemMeta(item, t)
            : t("composer.linearItemMeta", {
                identifier: item.identifier,
                state: item.state,
              })}
        </span>
      </div>
      <Button
        className="h-7 shrink-0 px-2.5 text-xs"
        onClick={() => onAttach(item)}
        size="sm"
        type="button"
      >
        {t("composer.attachGitHubConfirm")}
      </Button>
    </div>
  );
}

function SourceControlItemRow({
  item,
  onSelect,
}: {
  item: SourceControlRowItem;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const changeRequest = "source" in item;

  return (
    <CommandItem
      className="items-start gap-2.5 py-2"
      onSelect={onSelect}
      value={item.webUrl}
    >
      <SourceControlItemIcon className="mt-0.5" item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate">{item.title}</span>
        <span className="truncate text-xs font-normal text-muted-foreground">
          {sourceControlItemMeta(item, t)}
        </span>
      </span>
      {changeRequest && item.draft ? (
        <span className="text-xs text-muted-foreground">
          {t("common.draft")}
        </span>
      ) : null}
    </CommandItem>
  );
}

function SourceControlItemIcon({
  className,
  item,
}: {
  className?: string;
  item: SourceControlRowItem;
}) {
  const Icon = "source" in item ? GitPullRequest : RecordIcon;
  return (
    <Icon
      className={cn(className, sourceControlStateClassName(item))}
      weight="duotone"
    />
  );
}

function sourceControlItemMeta(
  item: SourceControlRowItem,
  t: (key: string, options?: Record<string, string>) => string,
) {
  const identifier = item.number === null ? item.id : `#${item.number}`;
  const parts = [`${identifier} · ${item.repository.displayPath}`];
  parts.push(gitHubStateLabel(item.state, t));
  if ("draft" in item && item.draft) parts.push(t("common.draft"));
  if (is.nonEmptyString(item.author?.login))
    parts.push(`@${item.author.login}`);
  if (is.nonEmptyString(item.updatedAt)) {
    parts.push(
      t("composer.attachGitHubUpdated", {
        time: formatRelativeTime(item.updatedAt),
      }),
    );
  }
  return parts.join(" · ");
}

function legacyGitHubItemMeta(
  item: Extract<ResolvedTaskLink, { provider: "github" }>,
  t: (key: string, options?: Record<string, string>) => string,
) {
  const parts = [`#${item.number} · ${item.owner}/${item.repo}`];
  parts.push(gitHubStateLabel(item.state, t));
  if (item.isDraft === true) parts.push(t("common.draft"));
  if (is.nonEmptyString(item.author)) parts.push(`@${item.author}`);
  return parts.join(" · ");
}

function gitHubStateLabel(state: string, t: (key: string) => string) {
  switch (state.toUpperCase()) {
    case "MERGED":
      return t("composer.taskLinkStateMerged");
    case "OPEN":
      return t("composer.taskLinkStateOpen");
    default:
      return t("composer.taskLinkStateClosed");
  }
}

function sourceControlStateClassName(item: SourceControlRowItem) {
  if ("draft" in item && item.draft) return "text-muted-foreground";
  switch (item.state.toUpperCase()) {
    case "MERGED":
      return "text-violet-500";
    case "OPEN":
      return "text-emerald-500";
    default:
      return "text-muted-foreground";
  }
}

function useDebouncedValue(value: string, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function formatRelativeTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;

  const elapsedSeconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(appLocale(), {
    numeric: "auto",
  });
  const units = [
    { limit: 60, seconds: 1, unit: "second" },
    { limit: 3600, seconds: 60, unit: "minute" },
    { limit: 86_400, seconds: 3600, unit: "hour" },
    { limit: 604_800, seconds: 86_400, unit: "day" },
    { limit: 2_592_000, seconds: 604_800, unit: "week" },
    { limit: 31_536_000, seconds: 2_592_000, unit: "month" },
  ] as const;

  for (const { limit, seconds, unit } of units) {
    if (Math.abs(elapsedSeconds) < limit) {
      return formatter.format(Math.round(elapsedSeconds / seconds), unit);
    }
  }
  return formatter.format(Math.round(elapsedSeconds / 31_536_000), "year");
}

const SOURCE_CONTROL_ERROR_TRANSLATION_KEYS = {
  "source-control/cli-missing": "composer.sourceControlErrors.cliMissing",
  "source-control/unauthenticated":
    "composer.sourceControlErrors.cliUnauthenticated",
  "source-control/fetch-failed": "composer.sourceControlErrors.fetchFailed",
  "source-control/item-not-found": "composer.sourceControlErrors.notFound",
  "source-control/url-unsupported":
    "composer.sourceControlErrors.urlUnsupported",
} as const satisfies Partial<Record<DaemonErrorCode, string>>;

type SourceControlErrorCode =
  keyof typeof SOURCE_CONTROL_ERROR_TRANSLATION_KEYS;

function taskLinkErrorMessage(
  cause: unknown,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (
    cause instanceof DaemonRequestError &&
    isSourceControlErrorCode(cause.code)
  ) {
    return t(SOURCE_CONTROL_ERROR_TRANSLATION_KEYS[cause.code]);
  }
  if (cause instanceof DaemonRequestError && isTaskLinkErrorCode(cause.code)) {
    return t(TASK_LINK_ERROR_TRANSLATION_KEYS[cause.code]);
  }
  if (cause instanceof Error && is.nonEmptyString(cause.message)) {
    return cause.message;
  }
  return t("composer.sourceControlErrors.fetchFailed");
}

const TASK_LINK_ERROR_TRANSLATION_KEYS = {
  "linear-fetch-failed": "composer.taskLinkErrors.linearFetchFailed",
  "linear-item-not-found": "composer.taskLinkErrors.linearNotFound",
  "linear-unauthorized": "composer.taskLinkErrors.linearUnauthorized",
  "link-unsupported": "composer.taskLinkErrors.unsupported",
  "pr-from-fork-unsupported": "composer.taskLinkErrors.prForkUnsupported",
} as const satisfies Partial<Record<DaemonErrorCode, string>>;

type TaskLinkErrorCode = keyof typeof TASK_LINK_ERROR_TRANSLATION_KEYS;

function isTaskLinkErrorCode(
  code: DaemonErrorCode | undefined,
): code is TaskLinkErrorCode {
  return (
    code !== undefined && Object.hasOwn(TASK_LINK_ERROR_TRANSLATION_KEYS, code)
  );
}

function isSourceControlErrorCode(
  code: DaemonErrorCode | undefined,
): code is SourceControlErrorCode {
  return (
    code !== undefined &&
    Object.hasOwn(SOURCE_CONTROL_ERROR_TRANSLATION_KEYS, code)
  );
}
