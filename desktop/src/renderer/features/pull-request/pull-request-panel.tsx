import type {
  GitHubMergeMethod,
  GitHubPullRequestCheck,
  GitHubPullRequestReviewThread,
  GitHubPullRequestStatus,
} from "@angel-engine/daemon-api/github";
import type { FC } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import {
  ArrowSquareOut,
  CheckCircle,
  Clock,
  GitPullRequest,
  SpinnerGap,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceChecksSection } from "@/app/workspace/workspace-checks-panel";
import {
  WorkspaceToolBanner,
  WorkspaceToolEmpty,
} from "@/app/workspace/workspace-tool-layout";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { CollapsibleText } from "@/components/ui/collapsible-text";
import { confirmAction } from "@/components/ui/confirm-dialog";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toast";
import { archiveWorkspaceMutationOptions } from "@/features/chat/api/queries";
import {
  mergePullRequestMutationOptions,
  pullRequestStatusQueryOptions,
  resolveReviewThreadMutationOptions,
} from "@/features/pull-request/api/queries";
import {
  deriveMergeBlockers,
  optionalFailedChecks,
  type MergeBlocker,
} from "@/features/pull-request/derive-merge-blockers";
import { ShepherdSection } from "@/features/shepherd/shepherd-section";

const mergeMethods: GitHubMergeMethod[] = ["squash", "merge", "rebase"];

export const PullRequestPanel: FC<{
  focusSection?: "checks" | null;
  onFocusSectionHandled?: () => void;
  root: string;
}> = ({ focusSection = null, onFocusSectionHandled, root }) => {
  const { active, api, chatId, openBrowserTab } = useWorkspaceToolSurface();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();
  const statusQuery = useQuery(
    pullRequestStatusQueryOptions({ active, api, root }),
  );
  const mergeMutation = useMutation(
    mergePullRequestMutationOptions({ api, queryClient, root }),
  );
  const resolveMutation = useMutation(
    resolveReviewThreadMutationOptions({ api, queryClient, root }),
  );
  const archiveMutation = useMutation(
    archiveWorkspaceMutationOptions({ api, queryClient }),
  );
  const status = statusQuery.data;
  const [selectedMethod, setSelectedMethod] = useState<GitHubMergeMethod>(() =>
    readMergeMethod(root),
  );
  const [deleteBranch, setDeleteBranch] = useState<boolean | null>(null);

  if (statusQuery.isPending) {
    return (
      <WorkspaceToolEmpty
        detail={t("workspace.tools.pullRequest.checking")}
        icon={GitPullRequest}
        title={t("workspace.tools.pullRequest.title")}
      />
    );
  }
  if (statusQuery.error !== null) {
    const error = statusQuery.error;
    const errorCode =
      error instanceof DaemonRequestError
        ? (error.code ?? "github-fetch-failed")
        : "github-fetch-failed";
    const copy = pullRequestErrorCopy(errorCode, t);
    return (
      <WorkspaceToolEmpty
        detail={copy.detail}
        icon={GitPullRequest}
        title={copy.title}
      />
    );
  }
  if (status === undefined) return null;

  if (
    status.state === "MERGED" &&
    !isMergePromptDismissed(root, status.number)
  ) {
    const mergedMethod = readMergedMethod(root, status.number);
    return (
      <MergedPrompt
        chatId={chatId}
        method={mergedMethod}
        status={status}
        onArchive={async () => {
          if (!is.nonEmptyString(chatId)) return;
          try {
            const confirmed = await confirmAction({
              cancelLabel: t("common.cancel"),
              confirmLabel: t("workspace.tools.pullRequest.archive"),
              description: status.worktreeDirty
                ? t("workspace.tools.pullRequest.archiveConfirmDirtyDetail", {
                    path: root,
                  })
                : t("workspace.tools.pullRequest.archiveConfirmDetail", {
                    path: root,
                  }),
              title: t("workspace.tools.pullRequest.archiveConfirmTitle"),
              tone: "danger",
            });
            if (!confirmed) return;
            await archiveMutation.mutateAsync(chatId);
          } catch (error) {
            toast({
              description:
                error instanceof Error ? error.message : String(error),
              title: t("workspace.tools.pullRequest.archiveFailed"),
              variant: "destructive",
            });
          }
        }}
        onContinue={() => {
          dismissMergePrompt(root, status.number);
          void statusQuery.refetch();
        }}
      />
    );
  }

  if (status.state !== "OPEN") {
    return (
      <WorkspaceToolEmpty
        detail={t("workspace.tools.pullRequest.noOpenDetail")}
        icon={GitPullRequest}
        title={t("workspace.tools.pullRequest.noOpen")}
      />
    );
  }

  const method = status.allowedMergeMethods.includes(selectedMethod)
    ? selectedMethod
    : status.defaultMergeMethod;
  const blockers = deriveMergeBlockers(status);
  const optionalChecks = optionalFailedChecks(status);
  const checkingMergeability = status.mergeable === "UNKNOWN";
  const effectiveDeleteBranch = deleteBranch ?? status.deleteBranchOnMerge;
  const canMerge =
    blockers.length === 0 &&
    !checkingMergeability &&
    status.allowedMergeMethods.length > 0;

  const merge = async () => {
    if (!canMerge) return;
    try {
      const result = await mergeMutation.mutateAsync({
        cwd: root,
        deleteBranch: effectiveDeleteBranch,
        method,
        number: status.number,
      });
      if (!result.merged) {
        throw new Error(t("workspace.tools.pullRequest.mergeChanged"));
      }
      rememberMerge(root, status.number, method);
      await statusQuery.refetch();
    } catch (error) {
      await statusQuery.refetch();
      toast({
        description: error instanceof Error ? error.message : String(error),
        title: t("workspace.tools.pullRequest.mergeFailed"),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              #{status.number} {status.title}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {status.headRefName} → {status.baseRefName}
              {status.author === null ? null : ` · ${status.author}`}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              aria-label={t("workspace.tools.pullRequest.open")}
              onClick={() => openBrowserTab(status.url)}
              size="icon-sm"
              variant="ghost"
            >
              <ArrowSquareOut />
            </Button>
            <Button
              disabled={statusQuery.isFetching}
              onClick={() => void statusQuery.refetch()}
              size="sm"
              variant="ghost"
            >
              {statusQuery.isFetching ? (
                <SpinnerGap className="animate-spin" />
              ) : null}
              {t("workspace.tools.pullRequest.refresh")}
            </Button>
          </div>
        </header>

        <section className="space-y-1.5">
          <h3 className="text-xs font-medium">
            {t("workspace.tools.pullRequest.body")}
          </h3>
          {is.nonEmptyString(status.body.trim()) ? (
            <CollapsibleText
              fadeClassName="from-background"
              resetKey={`pr-body:${status.number}`}
            >
              <p className="wrap-break-word whitespace-pre-wrap text-xs select-text">
                {status.body}
              </p>
            </CollapsibleText>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("workspace.tools.pullRequest.emptyBody")}
            </p>
          )}
        </section>

        {checkingMergeability ? (
          <WorkspaceToolBanner tone="attention">
            {t("workspace.tools.pullRequest.checkingMergeability")}
          </WorkspaceToolBanner>
        ) : blockers.length > 0 ? (
          <WorkspaceToolBanner tone="danger">
            <div className="mb-1 font-medium">
              {t("workspace.tools.pullRequest.blocked")}
            </div>
            <ul className="space-y-1">
              {blockers.map((blocker) => (
                <BlockerRow
                  blocker={blocker}
                  key={blocker.kind}
                  onOpen={openBrowserTab}
                />
              ))}
            </ul>
          </WorkspaceToolBanner>
        ) : (
          <div className="flex items-center gap-2 text-xs text-status-success">
            <CheckCircle className="size-4 shrink-0" weight="fill" />
            {t("workspace.tools.pullRequest.ready")}
          </div>
        )}

        {status.behindBy > 0 && status.mergeStateStatus !== "BEHIND" ? (
          <WorkspaceToolBanner tone="attention">
            <div className="flex items-start gap-1.5">
              <WarningCircle
                className="mt-0.5 size-4 shrink-0 text-status-attention"
                weight="fill"
              />
              <span>
                {t("workspace.tools.pullRequest.blockers.behindBase", {
                  count: status.behindBy,
                })}
              </span>
            </div>
          </WorkspaceToolBanner>
        ) : null}

        {optionalChecks.length > 0 ? (
          <WorkspaceToolBanner tone="attention">
            {t("workspace.tools.pullRequest.optionalChecksFailed", {
              count: optionalChecks.length,
              names: optionalChecks
                .slice(0, 3)
                .map((check) => check.name)
                .join(", "),
            })}
            <CheckLinks checks={optionalChecks} onOpen={openBrowserTab} />
          </WorkspaceToolBanner>
        ) : null}

        <div className="space-y-2 border-t border-border-subtle pt-3">
          <div className="flex gap-2">
            <NativeSelect
              aria-label={t("workspace.tools.pullRequest.method")}
              className="min-w-0 flex-1"
              onChange={(event) => {
                const next = event.target.value as GitHubMergeMethod;
                setSelectedMethod(next);
                writeMergeMethod(root, next);
              }}
              value={method}
            >
              {mergeMethods.map((candidate) => (
                <NativeSelectOption
                  disabled={!status.allowedMergeMethods.includes(candidate)}
                  key={candidate}
                  value={candidate}
                >
                  {t(`workspace.tools.pullRequest.methods.${candidate}`)}
                  {status.allowedMergeMethods.includes(candidate)
                    ? ""
                    : ` — ${t("workspace.tools.pullRequest.methodDisabled")}`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              disabled={!canMerge || mergeMutation.isPending}
              onClick={() => void merge()}
            >
              {mergeMutation.isPending ? (
                <SpinnerGap className="animate-spin" />
              ) : null}
              {mergeMutation.isPending
                ? t("workspace.tools.pullRequest.merging")
                : t("workspace.tools.pullRequest.merge")}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              checked={effectiveDeleteBranch}
              onChange={(event) => setDeleteBranch(event.target.checked)}
              type="checkbox"
            />
            {t("workspace.tools.pullRequest.deleteBranch")}
          </label>
        </div>

        <WorkspaceChecksSection
          focus={focusSection === "checks"}
          onFocusHandled={onFocusSectionHandled}
          root={root}
        />

        {status.unresolvedThreads.length > 0 ? (
          <section className="space-y-2 border-t border-border-subtle pt-3">
            <h3 className="text-xs font-medium">
              {t("workspace.tools.pullRequest.unresolvedTitle", {
                count: status.unresolvedThreads.length,
              })}
            </h3>
            {status.unresolvedThreads.map((thread) => (
              <ReviewThreadRow
                key={thread.id}
                pending={resolveMutation.isPending}
                prNumber={status.number}
                thread={thread}
                onOpen={() => openBrowserTab(thread.url)}
                onResolve={() =>
                  resolveMutation.mutateAsync({
                    cwd: root,
                    threadId: thread.id,
                  })
                }
              />
            ))}
          </section>
        ) : null}

        <ShepherdSection status={status} />
      </div>
    </div>
  );
};

const BlockerRow: FC<{
  blocker: MergeBlocker;
  onOpen: (url: string) => void;
}> = ({ blocker, onOpen }) => {
  const { t } = useTranslation();
  let text: string;
  switch (blocker.kind) {
    case "behind-base":
      text = t("workspace.tools.pullRequest.blockers.behindBase", blocker);
      break;
    case "changes-requested":
      text = t("workspace.tools.pullRequest.blockers.changesRequested");
      break;
    case "conflict":
      text = t("workspace.tools.pullRequest.blockers.conflict");
      break;
    case "draft":
      text = t("workspace.tools.pullRequest.blockers.draft");
      break;
    case "permission-denied":
      text = t("workspace.tools.pullRequest.blockers.permissionDenied");
      break;
    case "repository-policy":
      text = t("workspace.tools.pullRequest.blockers.repositoryPolicy");
      break;
    case "required-checks-failed":
      text = t("workspace.tools.pullRequest.blockers.checksFailed", {
        count: blocker.checks.length,
        names: blocker.checks
          .slice(0, 3)
          .map((check) => check.name)
          .join(", "),
      });
      break;
    case "required-checks-pending":
      text = t("workspace.tools.pullRequest.blockers.checksPending", {
        count: blocker.checks.length,
        names: blocker.checks
          .slice(0, 3)
          .map((check) => check.name)
          .join(", "),
      });
      break;
    case "review-required":
      text = t("workspace.tools.pullRequest.blockers.reviewRequired");
      break;
    case "unresolved-threads":
      text = t(
        "workspace.tools.pullRequest.blockers.unresolvedThreads",
        blocker,
      );
      break;
  }
  const checks = "checks" in blocker ? blocker.checks : [];
  const icon =
    blocker.kind === "required-checks-pending" ? (
      <Clock
        className="mt-0.5 size-4 shrink-0 text-status-attention"
        weight="fill"
      />
    ) : blocker.kind === "behind-base" ? (
      <WarningCircle
        className="mt-0.5 size-4 shrink-0 text-status-attention"
        weight="fill"
      />
    ) : (
      <XCircle className="mt-0.5 size-4 shrink-0" weight="fill" />
    );
  return (
    <li className="flex gap-1.5">
      {icon}
      <div className="min-w-0">
        <span>{text}</span>
        <CheckLinks checks={checks} onOpen={onOpen} />
      </div>
    </li>
  );
};

const CheckLinks: FC<{
  checks: GitHubPullRequestCheck[];
  onOpen: (url: string) => void;
}> = ({ checks, onOpen }) => {
  const { t } = useTranslation();
  const linkedChecks = checks.filter(
    (check): check is GitHubPullRequestCheck & { url: string } =>
      is.nonEmptyString(check.url),
  );
  if (linkedChecks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {linkedChecks.map((check) => (
        <Button
          aria-label={`${t("workspace.tools.pullRequest.open")}: ${check.name}`}
          key={`${check.name}:${check.url}`}
          onClick={() => onOpen(check.url)}
          size="xs"
          variant="link"
        >
          <ArrowSquareOut />
          {check.name}
        </Button>
      ))}
    </div>
  );
};

const ReviewThreadRow: FC<{
  onOpen: () => void;
  onResolve: () => Promise<unknown>;
  pending: boolean;
  prNumber: number;
  thread: GitHubPullRequestReviewThread;
}> = ({ onOpen, onResolve, pending, prNumber, thread }) => {
  const { t } = useTranslation();
  return (
    <article className="space-y-2 rounded-md border border-border-subtle p-2.5 text-xs">
      <div className="font-mono text-muted-foreground">
        {thread.path ?? t("workspace.tools.pullRequest.generalComment")}
        {thread.line === null ? "" : `:${thread.line}`}
        {thread.author === null ? "" : ` · @${thread.author}`}
      </div>
      <CollapsibleText
        fadeClassName="from-background"
        resetKey={`pr-thread:${prNumber}:${thread.id}`}
      >
        <p className="wrap-break-word whitespace-pre-wrap select-text">
          {thread.body}
        </p>
      </CollapsibleText>
      <div className="flex justify-end gap-1">
        <Button onClick={onOpen} size="sm" variant="ghost">
          {t("workspace.tools.pullRequest.open")}
        </Button>
        <Button disabled={pending} onClick={() => void onResolve()} size="sm">
          {t("workspace.tools.pullRequest.resolve")}
        </Button>
      </div>
    </article>
  );
};

const MergedPrompt: FC<{
  chatId: string | null;
  method: GitHubMergeMethod | null;
  onArchive: () => Promise<void>;
  onContinue: () => void;
  status: GitHubPullRequestStatus;
}> = ({ chatId, method, onArchive, onContinue, status }) => {
  const { t } = useTranslation();
  return (
    <div className="flex h-full items-center justify-center p-5 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <CheckCircle className="size-10 text-status-success" weight="duotone" />
        <div>
          <h2 className="text-base font-semibold">
            {t("workspace.tools.pullRequest.merged", { number: status.number })}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {method === null
              ? t("workspace.tools.pullRequest.mergedDetail")
              : t("workspace.tools.pullRequest.mergedMethod", {
                  method: t(`workspace.tools.pullRequest.methods.${method}`),
                })}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            disabled={!is.nonEmptyString(chatId)}
            onClick={() => void onArchive()}
          >
            {t("workspace.tools.pullRequest.archive")}
          </Button>
          <Button onClick={onContinue} variant="outline">
            {t("workspace.tools.pullRequest.continue")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("workspace.tools.pullRequest.archiveDetail")}
        </p>
      </div>
    </div>
  );
};

function pullRequestErrorCopy(
  code: string,
  t: ReturnType<typeof useTranslation>["t"],
) {
  switch (code) {
    case "github-cli-missing":
      return {
        detail: t("workspace.tools.pullRequest.errors.cliMissingDetail"),
        title: t("workspace.tools.pullRequest.errors.cliMissing"),
      };
    case "github-cli-unauthenticated":
      return {
        detail: t("workspace.tools.pullRequest.errors.unauthenticatedDetail"),
        title: t("workspace.tools.pullRequest.errors.unauthenticated"),
      };
    case "github-item-not-found":
      return {
        detail: t("workspace.tools.pullRequest.noOpenDetail"),
        title: t("workspace.tools.pullRequest.noOpen"),
      };
    case "github-permission-denied":
      return {
        detail: t("workspace.tools.pullRequest.errors.permissionDetail"),
        title: t("workspace.tools.pullRequest.errors.permission"),
      };
    default:
      return {
        detail: t("workspace.tools.pullRequest.errors.fetchDetail"),
        title: t("workspace.tools.pullRequest.errors.fetch"),
      };
  }
}

function mergeMethodKey(root: string) {
  return `angel-engine.pull-request.merge-method:${root}`;
}

function mergeResultKey(root: string, number: number) {
  return `angel-engine.pull-request.merged:${root}:${number}`;
}

function mergeDismissedKey(root: string, number: number) {
  return `angel-engine.pull-request.dismissed:${root}:${number}`;
}

function readMergeMethod(root: string): GitHubMergeMethod {
  const value = window.localStorage.getItem(mergeMethodKey(root));
  return value === "merge" || value === "rebase" || value === "squash"
    ? value
    : "squash";
}

function writeMergeMethod(root: string, method: GitHubMergeMethod) {
  window.localStorage.setItem(mergeMethodKey(root), method);
}

function rememberMerge(
  root: string,
  number: number,
  method: GitHubMergeMethod,
) {
  window.localStorage.setItem(mergeResultKey(root, number), method);
  window.localStorage.removeItem(mergeDismissedKey(root, number));
}

function readMergedMethod(
  root: string,
  number: number,
): GitHubMergeMethod | null {
  const value = window.localStorage.getItem(mergeResultKey(root, number));
  return value === "merge" || value === "rebase" || value === "squash"
    ? value
    : null;
}

function dismissMergePrompt(root: string, number: number) {
  window.localStorage.setItem(mergeDismissedKey(root, number), "1");
}

function isMergePromptDismissed(root: string, number: number) {
  return window.localStorage.getItem(mergeDismissedKey(root, number)) === "1";
}
