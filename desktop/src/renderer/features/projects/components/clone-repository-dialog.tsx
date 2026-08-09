import type { GitHubRepository } from "@angel-engine/daemon-api/github";
import type { FormEventHandler, ReactElement } from "react";

import { GitFork, Lock, MagnifyingGlass } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import is from "@sindresorhus/is";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  gitHubRepositoriesQueryOptions,
  gitHubRepositoryOwnersQueryOptions,
} from "@/features/projects/api/queries";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

type CloneTab = "github" | "url";

interface CloneRepositoryDialogProps {
  onClone: (url: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

/**
 * Repository picker for the "clone from git" flow. The GitHub tab browses what
 * the signed-in `gh` account can already reach; the URL tab is the escape hatch
 * for anything else (other hosts, unlisted remotes, deep links).
 */
export function CloneRepositoryDialog({
  onClone,
  onOpenChange,
  open,
}: CloneRepositoryDialogProps): ReactElement {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CloneTab>("github");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="
          gap-4 rounded-2xl
          sm:max-w-2xl
        "
      >
        <DialogHeader>
          <DialogTitle>{t("projectImport.title")}</DialogTitle>
          <DialogDescription>
            {t("projectImport.description")}
          </DialogDescription>
        </DialogHeader>

        <div
          className="
            flex w-fit items-center gap-1 rounded-lg bg-surface-1 p-1
          "
          role="tablist"
        >
          <CloneTabButton
            active={tab === "github"}
            label={t("projectImport.tabGitHub")}
            onSelect={() => setTab("github")}
          />
          <CloneTabButton
            active={tab === "url"}
            label={t("projectImport.tabUrl")}
            onSelect={() => setTab("url")}
          />
        </div>

        {tab === "github" ? (
          <GitHubRepositoryBrowser
            onSelect={(repository) => onClone(repository.url)}
            open={open}
          />
        ) : (
          <CloneUrlForm onSubmit={onClone} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CloneTabButton({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={cn(
        `
          rounded-md px-3 py-1 text-sm transition-colors duration-150
          ease-standard
        `,
        active
          ? "bg-card text-foreground shadow-xs"
          : `
            text-muted-foreground
            hover:text-foreground
          `,
      )}
      onClick={onSelect}
      role="tab"
      type="button"
    >
      {label}
    </button>
  );
}

function GitHubRepositoryBrowser({
  onSelect,
  open,
}: {
  onSelect: (repository: GitHubRepository) => void;
  open: boolean;
}) {
  const api = useApi();
  const { t } = useTranslation();
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const ownersQuery = useQuery(
    gitHubRepositoryOwnersQueryOptions({ api, enabled: open }),
  );
  const owners = ownersQuery.data?.owners;
  const activeOwner = selectedOwner ?? owners?.[0]?.login ?? null;

  useEffect(() => {
    setSearch("");
  }, [activeOwner]);

  const repositoriesQuery = useQuery(
    gitHubRepositoriesQueryOptions({ api, owner: activeOwner }),
  );
  const repositories = useMemo(() => {
    const all = repositoriesQuery.data?.repositories ?? [];
    const needle = search.trim().toLowerCase();
    if (needle.length === 0) return all;
    return all.filter(
      (repository) =>
        repository.name.toLowerCase().includes(needle) ||
        (repository.description ?? "").toLowerCase().includes(needle),
    );
  }, [repositoriesQuery.data, search]);

  if (ownersQuery.isPending) {
    return <BrowserPlaceholder label={t("projectImport.loadingOwners")} busy />;
  }
  if (ownersQuery.isError) {
    return (
      <BrowserPlaceholder
        detail={getErrorMessage(ownersQuery.error)}
        label={t("projectImport.ownersFailed")}
        onRetry={() => void ownersQuery.refetch()}
      />
    );
  }
  if (!is.nonEmptyArray(ownersQuery.data.owners)) {
    return <BrowserPlaceholder label={t("projectImport.noOwners")} />;
  }

  return (
    <div
      className="
        flex h-96 overflow-hidden rounded-lg border border-border-subtle
      "
    >
      <nav
        aria-label={t("projectImport.owners")}
        className="
          w-48 shrink-0 overflow-y-auto border-r border-border-subtle
          bg-surface-1 p-1
        "
      >
        {ownersQuery.data.owners.map((owner) => (
          <button
            className={cn(
              `
                flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left
                text-sm transition-colors duration-150 ease-standard
              `,
              owner.login === activeOwner
                ? "bg-overlay-active text-foreground"
                : `
                  text-muted-foreground
                  hover:bg-overlay-hover hover:text-foreground
                `,
            )}
            key={owner.login}
            onClick={() => setSelectedOwner(owner.login)}
            type="button"
          >
            <OwnerAvatar avatarUrl={owner.avatarUrl} login={owner.login} />
            <span className="min-w-0 truncate">{owner.login}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border-subtle p-2">
          <div className="relative">
            <MagnifyingGlass
              aria-hidden="true"
              className="
                absolute top-1/2 left-2.5 size-4 -translate-y-1/2
                text-muted-foreground
              "
            />
            <Input
              aria-label={t("projectImport.searchPlaceholder")}
              className="h-8 pl-8"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("projectImport.searchPlaceholder")}
              type="search"
              value={search}
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          <RepositoryList
            isError={repositoriesQuery.isError}
            isPending={repositoriesQuery.isPending}
            error={repositoriesQuery.error}
            onRetry={() => void repositoriesQuery.refetch()}
            onSelect={onSelect}
            repositories={repositories}
            search={search}
          />
        </div>
      </div>
    </div>
  );
}

function RepositoryList({
  error,
  isError,
  isPending,
  onRetry,
  onSelect,
  repositories,
  search,
}: {
  error: unknown;
  isError: boolean;
  isPending: boolean;
  onRetry: () => void;
  onSelect: (repository: GitHubRepository) => void;
  repositories: GitHubRepository[];
  search: string;
}) {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <BrowserPlaceholder busy label={t("projectImport.loadingRepositories")} />
    );
  }
  if (isError) {
    return (
      <BrowserPlaceholder
        detail={getErrorMessage(error)}
        label={t("projectImport.repositoriesFailed")}
        onRetry={onRetry}
      />
    );
  }
  if (repositories.length === 0) {
    return (
      <BrowserPlaceholder
        label={
          search.trim().length > 0
            ? t("projectImport.noMatches", { query: search.trim() })
            : t("projectImport.noRepositories")
        }
      />
    );
  }

  return (
    <ul>
      {repositories.map((repository) => (
        <li key={repository.nameWithOwner}>
          <button
            className="
              flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left
              transition-colors duration-150 ease-standard
              hover:bg-overlay-hover
            "
            onClick={() => onSelect(repository)}
            type="button"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm">{repository.name}</span>
              {repository.isPrivate ? (
                <Lock
                  aria-label={t("projectImport.privateBadge")}
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : null}
              {repository.isFork ? (
                <GitFork
                  aria-label={t("projectImport.forkBadge")}
                  className="size-3 shrink-0 text-muted-foreground"
                />
              ) : null}
              {repository.isArchived ? (
                <span
                  className="
                    shrink-0 rounded-sm bg-surface-1 px-1 text-[10px]
                    text-muted-foreground
                  "
                >
                  {t("projectImport.archivedBadge")}
                </span>
              ) : null}
            </span>
            {is.nonEmptyString(repository.description) ? (
              <span className="truncate text-xs text-muted-foreground">
                {repository.description}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function OwnerAvatar({
  avatarUrl,
  login,
}: {
  avatarUrl: string | null;
  login: string;
}) {
  if (!is.nonEmptyString(avatarUrl)) {
    return (
      <span
        aria-hidden="true"
        className="
          flex size-5 shrink-0 items-center justify-center rounded-full
          bg-surface-2 text-[10px] uppercase
        "
      >
        {login.slice(0, 1)}
      </span>
    );
  }
  return (
    <img alt="" className="size-5 shrink-0 rounded-full" src={avatarUrl} />
  );
}

function BrowserPlaceholder({
  busy = false,
  detail,
  label,
  onRetry,
}: {
  busy?: boolean;
  detail?: string;
  label: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="
        flex h-full min-h-24 flex-col items-center justify-center gap-2 p-6
        text-center text-sm text-muted-foreground
      "
    >
      {busy ? <Spinner /> : null}
      <span>{label}</span>
      {is.nonEmptyString(detail) ? (
        <span className="text-xs break-all">{detail}</span>
      ) : null}
      {onRetry ? (
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          {t("projectImport.retry")}
        </Button>
      ) : null}
    </div>
  );
}

function CloneUrlForm({ onSubmit }: { onSubmit: (url: string) => void }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const trimmed = url.trim();

  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm">{t("projectImport.urlLabel")}</span>
        <Input
          autoFocus
          onChange={(event) => setUrl(event.target.value)}
          placeholder={t("projectImport.urlPlaceholder")}
          value={url}
        />
        <span className="text-xs text-muted-foreground">
          {t("projectImport.urlHint")}
        </span>
      </label>
      <div className="flex justify-end">
        <Button disabled={trimmed.length === 0} type="submit">
          {t("projectImport.clone")}
        </Button>
      </div>
    </form>
  );
}
