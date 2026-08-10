import type { DaemonErrorCode } from "@angel-engine/daemon-api/daemon";
import type {
  GitHubItemKind,
  GitHubResolvedItem,
} from "@angel-engine/daemon-api/github";
import type { FC } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import {
  GitPullRequest,
  GithubLogo,
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
  githubItemsQueryOptions,
  githubResolveQueryOptions,
} from "@/features/chat/api/queries";
import type { ComposerGitHubAttachment } from "@/features/chat/components/composer/github-attachments";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import { appLocale } from "@/platform/format-time";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

type PromptGitHubAttachButtonProps = {
  disabled?: boolean;
  onAttached: (attachment: ComposerGitHubAttachment) => void;
};

const SEARCH_DEBOUNCE_MS = 250;
const ITEM_LIMIT = 30;
const GITHUB_ITEM_URL_PATTERN =
  /^https:\/\/(?:www\.)?github\.com\/[^/\s]+\/[^/\s]+\/(?:issues|pull)\/\d+/;

export const PromptGitHubAttachButton: FC<PromptGitHubAttachButtonProps> = ({
  disabled = false,
  onAttached,
}) => {
  const { t } = useTranslation();
  const api = useApi();
  const environment = useChatEnvironment();
  const cwd = environment.projectPath ?? environment.cwd;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const activeRequestId = useRef(0);

  useEffect(
    () => () => {
      activeRequestId.current += 1;
    },
    [],
  );

  const directUrl = GITHUB_ITEM_URL_PATTERN.test(debouncedSearch.trim())
    ? debouncedSearch.trim()
    : null;
  const itemsQuery = useQuery(
    githubItemsQueryOptions({
      api,
      cwd,
      enabled: open,
      limit: ITEM_LIMIT,
      query: directUrl === null ? debouncedSearch : "",
    }),
  );
  const directItemQuery = useQuery(
    githubResolveQueryOptions({ api, enabled: open, url: directUrl }),
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
  };

  const attachResolved = (resolved: GitHubResolvedItem) => {
    onAttached({
      ...resolved,
      id: `github-${resolved.kind}-${resolved.owner}-${resolved.repo}-${resolved.number}-${crypto.randomUUID()}`,
      provider: "github",
    });
    handleOpenChange(false);
  };

  const attachUrl = async (url: string) => {
    if (is.nonEmptyString(pendingUrl)) return;

    const requestId = activeRequestId.current + 1;
    activeRequestId.current = requestId;
    setPendingUrl(url);
    setAttachError(null);
    try {
      const resolved = await api.github.resolveUrl({ url });
      if (activeRequestId.current !== requestId) return;

      attachResolved(resolved);
    } catch (cause) {
      if (activeRequestId.current !== requestId) return;

      setPendingUrl(null);
      setAttachError(githubErrorMessage(cause, t));
    }
  };

  const items = itemsQuery.data?.items ?? [];
  const queryError = itemsQuery.error ?? directItemQuery.error;
  const errorMessage =
    attachError ??
    (queryError === null ? null : githubErrorMessage(queryError, t));
  const directItem =
    directUrl === null || directItemQuery.data?.url !== directUrl
      ? null
      : directItemQuery.data;
  const showLoading = itemsQuery.isFetching && itemsQuery.data === undefined;
  const hasRepository = is.nonEmptyString(cwd);
  const showEmpty =
    !itemsQuery.isFetching &&
    items.length === 0 &&
    directUrl === null &&
    !is.nonEmptyString(errorMessage);

  // The picker needs a repository to browse, so the composer hides the button
  // entirely outside project chats.
  if (!hasRepository) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        className="focus-visible:ring-0!"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
        size="icon-sm"
        title={t("composer.attachGitHub")}
        type="button"
        variant="ghost"
      >
        <GithubLogo weight="duotone" />
        <span className="sr-only">{t("composer.attachGitHub")}</span>
      </Button>
      <DialogContent
        aria-describedby={undefined}
        className="gap-3 overflow-hidden rounded-2xl p-0 sm:max-w-lg"
      >
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>{t("composer.attachGitHubTitle")}</DialogTitle>
        </DialogHeader>
        <Command className="bg-transparent" shouldFilter={false}>
          <CommandInput
            autoFocus
            className="px-2"
            onValueChange={setSearch}
            placeholder={t("composer.attachGitHubPlaceholder")}
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
          <CommandList className="max-h-80 px-1 pt-2 pb-2">
            {is.nonEmptyString(errorMessage) ? (
              <p className="px-3 py-6 text-center text-sm text-destructive">
                {errorMessage}
              </p>
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
            {items.map((item) => (
              <GitHubItemRow
                item={item}
                key={item.url}
                onSelect={() => void attachUrl(item.url)}
                pending={pendingUrl === item.url}
              />
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

type GitHubRowItem = {
  author: string | null;
  isDraft?: boolean;
  kind: GitHubItemKind;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  updatedAt?: string;
  url: string;
};

const previewCardClassName =
  "mx-2 mt-2 flex items-center gap-2.5 rounded-lg border border-border-subtle bg-muted/40 px-3 py-2";

function PastedUrlPreview({
  item,
  loading,
  onAttach,
  url,
}: {
  item: GitHubResolvedItem | null;
  loading: boolean;
  onAttach: (item: GitHubResolvedItem) => void;
  url: string;
}) {
  const { t } = useTranslation();

  if (item === null) {
    return (
      <div
        className={cn(previewCardClassName, "text-sm text-muted-foreground")}
      >
        <GithubLogo className="size-4 shrink-0" weight="duotone" />
        <span className="min-w-0 flex-1 truncate">{url}</span>
        {loading ? (
          <SpinnerGap className="size-4 shrink-0 animate-spin" />
        ) : null}
      </div>
    );
  }

  return (
    <div className={previewCardClassName}>
      <GitHubItemIcon className="size-4 shrink-0" item={item} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">{item.title}</span>
        <span className="truncate text-xs text-muted-foreground">
          {gitHubItemMeta(item, t)}
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

function GitHubItemRow({
  item,
  onSelect,
  pending,
}: {
  item: GitHubRowItem;
  onSelect: () => void;
  pending: boolean;
}) {
  const { t } = useTranslation();

  return (
    <CommandItem
      className="items-start gap-2.5 py-2"
      onSelect={onSelect}
      value={item.url}
    >
      <GitHubItemIcon className="mt-0.5" item={item} />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate">{item.title}</span>
        <span className="truncate text-xs font-normal text-muted-foreground">
          {gitHubItemMeta(item, t)}
        </span>
      </span>
      {pending ? <SpinnerGap className="mt-0.5 animate-spin" /> : null}
    </CommandItem>
  );
}

function GitHubItemIcon({
  className,
  item,
}: {
  className?: string;
  item: GitHubRowItem;
}) {
  const Icon = item.kind === "issue" ? RecordIcon : GitPullRequest;
  return (
    <Icon
      className={cn(className, gitHubStateClassName(item))}
      weight="duotone"
    />
  );
}

function gitHubItemMeta(
  item: GitHubRowItem,
  t: (key: string, options?: Record<string, string>) => string,
) {
  const parts = [`#${item.number} · ${item.owner}/${item.repo}`];
  if (is.nonEmptyString(item.author)) parts.push(`@${item.author}`);
  if (is.nonEmptyString(item.updatedAt)) {
    parts.push(
      t("composer.attachGitHubUpdated", {
        time: formatRelativeTime(item.updatedAt),
      }),
    );
  }
  return parts.join(" · ");
}

function gitHubStateClassName(item: GitHubRowItem) {
  if (item.isDraft === true) return "text-muted-foreground";
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

const GITHUB_ERROR_TRANSLATION_KEYS = {
  "github-cli-missing": "composer.githubErrors.cliMissing",
  "github-cli-unauthenticated": "composer.githubErrors.cliUnauthenticated",
  "github-fetch-failed": "composer.githubErrors.fetchFailed",
  "github-item-not-found": "composer.githubErrors.notFound",
  "github-url-unsupported": "composer.githubErrors.urlUnsupported",
} as const satisfies Partial<Record<DaemonErrorCode, string>>;

type GitHubErrorCode = keyof typeof GITHUB_ERROR_TRANSLATION_KEYS;

function githubErrorMessage(
  cause: unknown,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (cause instanceof DaemonRequestError && isGitHubErrorCode(cause.code)) {
    return t(GITHUB_ERROR_TRANSLATION_KEYS[cause.code]);
  }
  if (cause instanceof Error && is.nonEmptyString(cause.message)) {
    return cause.message;
  }
  return t("composer.githubErrors.fetchFailed");
}

function isGitHubErrorCode(
  code: DaemonErrorCode | undefined,
): code is GitHubErrorCode {
  return (
    code !== undefined && Object.hasOwn(GITHUB_ERROR_TRANSLATION_KEYS, code)
  );
}
