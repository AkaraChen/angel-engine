import type {
  RepositoryIdentity,
  RepositoryNamespace,
} from "@angel-engine/daemon-api/source-control";
import type { FormEventHandler, ReactElement } from "react";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import is from "@sindresorhus/is";
import { useState } from "react";
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
  sourceControlNamespacesQueryOptions,
  sourceControlRepositoriesQueryOptions,
} from "@/features/projects/api/queries";
import { useSourceControlActivation } from "@/features/source-control/api/use-activation";
import { capabilityState } from "@/features/source-control/model";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

type CloneTab = "provider" | "url";

interface CloneRepositoryDialogProps {
  onClone: (url: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  projectId: string | null;
}

/** Repository picker backed by the active source-control provider. */
export function CloneRepositoryDialog({
  onClone,
  onOpenChange,
  open,
  projectId,
}: CloneRepositoryDialogProps): ReactElement {
  const { t } = useTranslation();
  const [tab, setTab] = useState<CloneTab>("provider");
  const sourceControl = useSourceControlActivation(projectId);
  const namespacesCapability = capabilityState(
    sourceControl.capabilities,
    "discovery.listNamespaces",
  );
  const repositoriesCapability = capabilityState(
    sourceControl.capabilities,
    "discovery.listRepositories",
  );
  const cloneCapability = capabilityState(
    sourceControl.capabilities,
    "provider.clone",
  );
  const sourceControlReady =
    sourceControl.status === "active" &&
    is.nonEmptyString(sourceControl.projectPath) &&
    is.nonEmptyString(sourceControl.providerIdentity);
  const canBrowse =
    sourceControlReady &&
    namespacesCapability.supported &&
    repositoriesCapability.supported &&
    cloneCapability.supported;
  const activeTab = canBrowse ? tab : "url";
  const unavailableReason = discoveryUnavailableReason({
    cloneCapability,
    fallback: t("projectImport.discoveryUnavailable"),
    namespacesCapability,
    repositoriesCapability,
    sourceControlReady,
  });

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

        {canBrowse ? (
          <div
            className="
              flex w-fit items-center gap-1 rounded-lg bg-surface-1 p-1
            "
            role="tablist"
          >
            <CloneTabButton
              active={activeTab === "provider"}
              label={
                sourceControl.providerDisplayName ??
                t("projectImport.tabSourceControl")
              }
              onSelect={() => setTab("provider")}
            />
            <CloneTabButton
              active={activeTab === "url"}
              label={t("projectImport.tabUrl")}
              onSelect={() => setTab("url")}
            />
          </div>
        ) : null}

        {activeTab === "provider" && canBrowse ? (
          <ProviderRepositoryBrowser
            key={sourceControl.providerIdentity}
            onSelect={(repository) => {
              if (is.nonEmptyString(repository.webUrl)) {
                onClone(repository.webUrl);
              }
            }}
            open={open}
            projectPath={sourceControl.projectPath ?? ""}
            providerIdentity={sourceControl.providerIdentity ?? ""}
          />
        ) : (
          <div className="flex flex-col gap-3">
            {is.nonEmptyString(unavailableReason) ? (
              <p
                className="
                  rounded-lg border border-border-subtle bg-surface-1 px-3 py-2
                  text-sm text-muted-foreground
                "
                role="status"
              >
                {unavailableReason}
              </p>
            ) : null}
            <CloneUrlForm onSubmit={onClone} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function discoveryUnavailableReason({
  cloneCapability,
  fallback,
  namespacesCapability,
  repositoriesCapability,
  sourceControlReady,
}: {
  cloneCapability: ReturnType<typeof capabilityState>;
  fallback: string;
  namespacesCapability: ReturnType<typeof capabilityState>;
  repositoriesCapability: ReturnType<typeof capabilityState>;
  sourceControlReady: boolean;
}): string | null {
  if (!sourceControlReady) return fallback;
  if (!namespacesCapability.supported)
    return namespacesCapability.reason.message;
  if (!repositoriesCapability.supported)
    return repositoriesCapability.reason.message;
  if (!cloneCapability.supported) return cloneCapability.reason.message;
  return null;
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

function ProviderRepositoryBrowser({
  onSelect,
  open,
  projectPath,
  providerIdentity,
}: {
  onSelect: (repository: RepositoryIdentity) => void;
  open: boolean;
  projectPath: string;
  providerIdentity: string;
}) {
  const api = useApi();
  const { t } = useTranslation();
  const [selectedNamespaceId, setSelectedNamespaceId] = useState<string | null>(
    null,
  );
  const [search, setSearch] = useState("");

  const namespacesQuery = useQuery(
    sourceControlNamespacesQueryOptions({
      api,
      enabled: open,
      projectPath,
      providerIdentity,
      supported: true,
    }),
  );
  const namespaces = namespacesQuery.data ?? [];
  const activeNamespace =
    namespaces.find((namespace) => namespace.id === selectedNamespaceId) ??
    namespaces[0] ??
    null;
  const repositoriesQuery = useQuery(
    sourceControlRepositoriesQueryOptions({
      api,
      enabled: open,
      namespace: activeNamespace?.path ?? null,
      projectPath,
      providerIdentity,
      supported: true,
    }),
  );
  const repositories = filterRepositories(repositoriesQuery.data ?? [], search);

  if (namespacesQuery.isPending) {
    return <BrowserPlaceholder label={t("projectImport.loadingOwners")} busy />;
  }
  if (namespacesQuery.isError) {
    return (
      <BrowserPlaceholder
        detail={getErrorMessage(namespacesQuery.error)}
        label={t("projectImport.ownersFailed")}
        onRetry={() => void namespacesQuery.refetch()}
      />
    );
  }
  if (!is.nonEmptyArray(namespaces)) {
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
        {namespaces.map((namespace) => (
          <button
            className={cn(
              `
                flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left
                text-sm transition-colors duration-150 ease-standard
              `,
              namespace.id === activeNamespace.id
                ? "bg-overlay-active text-foreground"
                : `
                  text-muted-foreground
                  hover:bg-overlay-hover hover:text-foreground
                `,
            )}
            key={namespace.id}
            onClick={() => {
              setSelectedNamespaceId(namespace.id);
              setSearch("");
            }}
            type="button"
          >
            <NamespaceAvatar namespace={namespace} />
            <span className="min-w-0 truncate">{namespace.name}</span>
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

function filterRepositories(
  repositories: readonly RepositoryIdentity[],
  search: string,
): readonly RepositoryIdentity[] {
  const needle = search.trim().toLowerCase();
  if (needle.length === 0) return repositories;
  return repositories.filter(
    (repository) =>
      repository.name.toLowerCase().includes(needle) ||
      repository.displayPath.toLowerCase().includes(needle),
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
  onSelect: (repository: RepositoryIdentity) => void;
  repositories: readonly RepositoryIdentity[];
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
        <li key={`${repository.providerId}:${repository.displayPath}`}>
          <button
            className="
              flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left
              transition-colors duration-150 ease-standard
              hover:bg-overlay-hover
              disabled:cursor-not-allowed disabled:opacity-50
            "
            disabled={!is.nonEmptyString(repository.webUrl)}
            onClick={() => onSelect(repository)}
            type="button"
          >
            <span className="truncate text-sm">{repository.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {repository.displayPath}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NamespaceAvatar({ namespace }: { namespace: RepositoryNamespace }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <span
      aria-hidden="true"
      className="
        flex size-5 shrink-0 items-center justify-center rounded-full
        bg-surface-2 text-[10px] uppercase
      "
    >
      {imageFailed || !is.nonEmptyString(namespace.avatarUrl) ? (
        namespace.name.slice(0, 1)
      ) : (
        <img
          alt=""
          className="size-5 rounded-full object-cover"
          draggable={false}
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
          src={namespace.avatarUrl}
        />
      )}
    </span>
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
