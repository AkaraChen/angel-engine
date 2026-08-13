import type {
  CapabilityMatrix,
  CheckRun,
  MergeMethod,
  ReviewThread,
} from "@angel-engine/daemon-api/source-control";
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
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  WorkspaceToolBanner,
  WorkspaceToolEmpty,
} from "@/app/workspace/workspace-tool-layout";
import { WorkspaceChecksSection } from "@/app/workspace/workspace-checks-panel";
import { clearPullRequestChecksFocus } from "@/app/workspace/workspace-tool-checks-focus";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { CapabilityGate } from "@/features/source-control/components/capability-gate";
import { CollapsibleText } from "@/components/ui/collapsible-text";
import { confirmAction } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { archiveWorkspaceMutationOptions } from "@/features/chat/api/queries";
import { useSourceControlActivation } from "@/features/source-control/api/use-activation";
import { capabilityState } from "@/features/source-control/model";
import {
  checksSummaryQueryOptions,
  mergePullRequestMutationOptions,
  pullRequestStatusQueryOptions,
  reviewThreadsQueryOptions,
  resolveReviewThreadMutationOptions,
  type ChangeRequestStatusView,
} from "@/features/change-request/api/queries";
import {
  deriveMergeBlockers,
  optionalFailedChecks,
  type MergeBlocker,
} from "@/features/change-request/derive-merge-blockers";
import { ShepherdSection } from "@/features/shepherd/shepherd-section";
import { cn } from "@/platform/utils";

const mergeMethods: MergeMethod[] = ["squash", "merge", "rebase"];

export const ChangeRequestPanel: FC<{
  projectId: string | null;
  root: string;
}> = ({ projectId, root }) => {
  const {
    active,
    api,
    chatId,
    focusChecksSection,
    openBrowserTab,
    updateSnapshot,
  } = useWorkspaceToolSurface();
  const queryClient = useQueryClient();
  const sourceControl = useSourceControlActivation(projectId);
  const supportsList = capabilityState(
    sourceControl.capabilities,
    "changeRequests.list",
  ).supported;
  const supportsStatus = capabilityState(
    sourceControl.capabilities,
    "changeRequests.status",
  ).supported;
  const checksCapability = capabilityState(
    sourceControl.capabilities,
    "checks.snapshot",
  );
  const reviewsCapability = capabilityState(
    sourceControl.capabilities,
    "reviewThreads.list",
  );
  const resolveReviewCapability = capabilityState(
    sourceControl.capabilities,
    "reviewThreads.resolve",
  );
  const mergeCapability = capabilityState(
    sourceControl.capabilities,
    "changeRequests.merge",
  );
  const { t } = useTranslation();
  const toast = useToast();
  const statusQuery = useQuery(
    pullRequestStatusQueryOptions({
      active,
      api,
      projectPath: sourceControl.projectPath,
      providerIdentity: sourceControl.providerIdentity,
      supportsList,
      supportsStatus,
    }),
  );
  const mergeMutation = useMutation(
    mergePullRequestMutationOptions({
      api,
      projectPath: sourceControl.projectPath,
      providerIdentity: sourceControl.providerIdentity,
      queryClient,
    }),
  );
  const resolveMutation = useMutation(
    resolveReviewThreadMutationOptions({
      api,
      projectPath: sourceControl.projectPath,
      providerIdentity: sourceControl.providerIdentity,
      queryClient,
    }),
  );
  const archiveMutation = useMutation(
    archiveWorkspaceMutationOptions({ api, queryClient }),
  );
  const status = statusQuery.data;
  const changeRequestId = status?.changeRequest.id ?? null;
  const checksQuery = useQuery(
    checksSummaryQueryOptions({
      active,
      api,
      changeRequestId,
      projectPath: sourceControl.projectPath,
      providerIdentity: sourceControl.providerIdentity,
      supported: checksCapability.supported,
    }),
  );
  const reviewThreadsQuery = useQuery(
    reviewThreadsQueryOptions({
      active,
      api,
      changeRequestId,
      projectPath: sourceControl.projectPath,
      providerIdentity: sourceControl.providerIdentity,
      supported: reviewsCapability.supported,
    }),
  );
  const [selectedMethod, setSelectedMethod] = useState<MergeMethod>(() =>
    readMergeMethod(root),
  );
  const [deleteBranch, setDeleteBranch] = useState<boolean | null>(null);
  const [checksHighlighted, setChecksHighlighted] = useState(false);
  const checksSectionRef = useRef<HTMLDivElement>(null);
  const highlightTimeoutRef = useRef<number | null>(null);
  // Checks section only mounts for an OPEN PR; keep focus intent parked while
  // status is still loading or the panel is on a non-open empty/merged state.
  const checksSectionReady =
    !statusQuery.isPending &&
    statusQuery.error === null &&
    status !== undefined &&
    status.state === "OPEN";

  useEffect(() => {
    if (!focusChecksSection) {
      return;
    }
    // Still waiting for an OPEN PR body — do not consume the focus signal yet.
    if (statusQuery.isPending) {
      return;
    }
    if (!checksSectionReady) {
      // No Checks section will mount (error / no open PR). Drop the intent.
      updateSnapshot(clearPullRequestChecksFocus);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const section = checksSectionRef.current;
      if (section === null) {
        return;
      }
      section.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setChecksHighlighted(true);
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = window.setTimeout(
        () => setChecksHighlighted(false),
        1600,
      );
      updateSnapshot(clearPullRequestChecksFocus);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    checksSectionReady,
    focusChecksSection,
    statusQuery.isPending,
    updateSnapshot,
  ]);
  useEffect(
    () => () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    },
    [],
  );

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
        ? (error.code ?? "source-control/fetch-failed")
        : "source-control/fetch-failed";
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
  const reviewThreads = (reviewThreadsQuery.data ?? []).filter(
    (thread) => thread.state === "unresolved",
  );
  const unresolvedThreadCount = reviewThreads.length;
  const blockers = deriveMergeBlockers({
    checks: checksQuery.data ?? null,
    requirements: status.changeRequest.mergeRequirements,
    reviewDecision: status.changeRequest.reviewDecision,
    unresolvedThreadCount,
    viewerCanMerge: status.changeRequest.viewerCanMerge,
  });
  const optionalChecks = optionalFailedChecks(checksQuery.data ?? null);
  const checkingMergeability = status.changeRequest.mergeRequirements.some(
    (requirement) =>
      requirement.kind === "conflict" && requirement.state === "pending",
  );
  const effectiveDeleteBranch = deleteBranch ?? status.deleteBranchOnMerge;
  const canMerge =
    mergeCapability.supported &&
    blockers.length === 0 &&
    !checkingMergeability &&
    status.allowedMergeMethods.length > 0;

  const merge = async () => {
    if (!canMerge) return;
    try {
      const result = await mergeMutation.mutateAsync({
        deleteSourceBranch: effectiveDeleteBranch,
        id: status.changeRequest.id,
        method,
      });
      if (result.state !== "merged") {
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
            {sourceControl.providerDisplayName && sourceControl.repository ? (
              <div className="truncate text-xs text-muted-foreground">
                {sourceControl.providerDisplayName} ·{" "}
                {sourceControl.repository.displayPath}
              </div>
            ) : null}
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

        {is.nonEmptyString(status.body) ? (
          <section className="space-y-1.5">
            <h3 className="text-xs font-medium">
              {t("workspace.tools.pullRequest.description")}
            </h3>
            <CollapsibleText
              className="wrap-break-word whitespace-pre-wrap text-xs text-muted-foreground select-text"
              resetKey={status.number}
              text={status.body}
            />
          </section>
        ) : null}

        {mergeCapability.supported ? (
          <section className="space-y-2 border-t border-border-subtle pt-3">
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

            <div className="flex gap-2">
              <Select
                onValueChange={(value) => {
                  const next = value as MergeMethod;
                  setSelectedMethod(next);
                  writeMergeMethod(root, next);
                }}
                value={method}
              >
                <SelectTrigger
                  aria-label={t("workspace.tools.pullRequest.method")}
                  className="min-w-0 flex-1"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mergeMethods.map((candidate) => (
                    <SelectItem
                      disabled={!status.allowedMergeMethods.includes(candidate)}
                      key={candidate}
                      value={candidate}
                    >
                      {t(`workspace.tools.pullRequest.methods.${candidate}`)}
                      {status.allowedMergeMethods.includes(candidate)
                        ? ""
                        : ` — ${t("workspace.tools.pullRequest.methodDisabled")}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </section>
        ) : null}

        <div
          className={cn(
            "rounded-md transition-[background-color,box-shadow] duration-300",
            checksHighlighted &&
              "bg-primary/5 ring-2 ring-primary/45 ring-offset-2 ring-offset-background",
          )}
          ref={checksSectionRef}
        >
          <WorkspaceChecksSection
            capabilities={sourceControl.capabilities}
            changeRequestId={changeRequestId}
            projectPath={sourceControl.projectPath}
            providerIdentity={sourceControl.providerIdentity}
          />
        </div>

        {!reviewsCapability.supported ? null : reviewThreadsQuery.isError ? (
          <section className="space-y-2 border-t border-border-subtle pt-3">
            <WorkspaceToolBanner tone="danger">
              {reviewThreadsQuery.error instanceof Error
                ? reviewThreadsQuery.error.message
                : String(reviewThreadsQuery.error)}
            </WorkspaceToolBanner>
          </section>
        ) : reviewThreads.length > 0 ? (
          <section className="space-y-2 border-t border-border-subtle pt-3">
            <h3 className="text-xs font-medium">
              {t("workspace.tools.pullRequest.unresolvedTitle", {
                count: unresolvedThreadCount,
              })}
            </h3>
            {!resolveReviewCapability.supported ? (
              <p
                className="text-xs text-muted-foreground"
                data-testid="workspace-review-resolve-unsupported"
              >
                {resolveReviewCapability.reason.message}
              </p>
            ) : null}
            {reviewThreads.map((thread) => (
              <ReviewThreadRow
                capabilities={sourceControl.capabilities}
                key={thread.id}
                pending={resolveMutation.isPending}
                pullRequestNumber={status.number}
                thread={thread}
                onOpen={(url) => openBrowserTab(url)}
                onResolve={() => resolveMutation.mutateAsync(thread.id)}
              />
            ))}
          </section>
        ) : null}

        <ShepherdSection
          changeRequest={status.changeRequest}
          projectId={projectId}
        />
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
  checks: readonly CheckRun[];
  onOpen: (url: string) => void;
}> = ({ checks, onOpen }) => {
  const { t } = useTranslation();
  const linkedChecks = checks.filter(
    (check): check is CheckRun & { detailsUrl: string } =>
      is.nonEmptyString(check.detailsUrl),
  );
  if (linkedChecks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 pt-1">
      {linkedChecks.map((check) => (
        <Button
          aria-label={`${t("workspace.tools.pullRequest.open")}: ${check.name}`}
          key={`${check.id}:${check.detailsUrl}`}
          onClick={() => onOpen(check.detailsUrl)}
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
  capabilities: CapabilityMatrix;
  onOpen: (url: string) => void;
  onResolve: () => Promise<unknown>;
  pending: boolean;
  pullRequestNumber: number;
  thread: ReviewThread;
}> = ({
  capabilities,
  onOpen,
  onResolve,
  pending,
  pullRequestNumber,
  thread,
}) => {
  const { t } = useTranslation();
  const firstComment = thread.comments[0] ?? null;
  const author = firstComment?.author?.login ?? null;
  const webUrl = firstComment?.webUrl ?? null;
  const body = thread.comments.map((comment) => comment.body).join("\n\n");
  return (
    <article className="space-y-2 rounded-md border border-border-subtle p-2.5 text-xs">
      <div className="font-mono text-muted-foreground">
        {thread.location?.path ??
          t("workspace.tools.pullRequest.generalComment")}
        {thread.location?.endLine == null ? "" : `:${thread.location.endLine}`}
        {author === null ? "" : ` · @${author}`}
      </div>
      <CollapsibleText
        className="wrap-break-word whitespace-pre-wrap select-text"
        resetKey={`${pullRequestNumber}:${thread.id}`}
        text={body}
      />
      <div className="flex justify-end gap-1">
        {webUrl === null ? null : (
          <Button onClick={() => onOpen(webUrl)} size="sm" variant="ghost">
            {t("workspace.tools.pullRequest.open")}
          </Button>
        )}
        {thread.resolvable ? (
          <CapabilityGate
            capabilities={capabilities}
            capability="reviewThreads.resolve"
          >
            <Button
              disabled={pending}
              onClick={() => void onResolve()}
              size="sm"
            >
              {t("workspace.tools.pullRequest.resolve")}
            </Button>
          </CapabilityGate>
        ) : null}
      </div>
    </article>
  );
};

const MergedPrompt: FC<{
  chatId: string | null;
  method: MergeMethod | null;
  onArchive: () => Promise<void>;
  onContinue: () => void;
  status: ChangeRequestStatusView;
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
    case "source-control/cli-missing":
      return {
        detail: t("workspace.tools.pullRequest.errors.cliMissingDetail"),
        title: t("workspace.tools.pullRequest.errors.cliMissing"),
      };
    case "source-control/unauthenticated":
      return {
        detail: t("workspace.tools.pullRequest.errors.unauthenticatedDetail"),
        title: t("workspace.tools.pullRequest.errors.unauthenticated"),
      };
    case "source-control/item-not-found":
      return {
        detail: t("workspace.tools.pullRequest.noOpenDetail"),
        title: t("workspace.tools.pullRequest.noOpen"),
      };
    case "source-control/permission-denied":
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

function readMergeMethod(root: string): MergeMethod {
  const value = window.localStorage.getItem(mergeMethodKey(root));
  return value === "merge" || value === "rebase" || value === "squash"
    ? value
    : "squash";
}

function writeMergeMethod(root: string, method: MergeMethod) {
  window.localStorage.setItem(mergeMethodKey(root), method);
}

function rememberMerge(root: string, number: number, method: MergeMethod) {
  window.localStorage.setItem(mergeResultKey(root, number), method);
  window.localStorage.removeItem(mergeDismissedKey(root, number));
}

function readMergedMethod(root: string, number: number): MergeMethod | null {
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
