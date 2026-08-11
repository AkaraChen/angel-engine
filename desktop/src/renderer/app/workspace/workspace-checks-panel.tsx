import type {
  GitHubCheckBucket,
  GitHubPrCheck,
} from "@angel-engine/daemon-api/github";
import type { FC } from "react";

import {
  ArrowClockwise,
  ArrowSquareOut,
  CaretDown,
  CheckCircle,
  CircleNotch,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

const CHECKS_POLL_MS = 15_000;

export const workspacePullRequestChecksSectionId = "workspace-pr-checks";

const checkBucketRank: Record<GitHubCheckBucket, number> = {
  fail: 0,
  pending: 1,
  cancel: 2,
  skipping: 3,
  pass: 4,
};

/**
 * Checks list embedded in the Pull Request panel. Expects an open PR context;
 * empty / no-PR states are owned by the parent panel.
 */
export const WorkspaceChecksSection: FC<{
  focus?: boolean;
  onFocusHandled?: () => void;
  root: string;
}> = ({ focus = false, onFocusHandled, root }) => {
  const { active, api, openBrowserTab } = useWorkspaceToolSurface();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const chatId = useWorkspaceToolStore((state) => state.context.chatId);
  const startRun = useChatRunStore((state) => state.startRun);
  const sectionRef = useRef<HTMLElement>(null);
  const [highlighted, setHighlighted] = useState(false);
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(
    null,
  );

  const checksQuery = useQuery({
    enabled: active && is.nonEmptyString(root),
    queryFn: async () => api.github.listPrChecks({ cwd: root }),
    queryKey: queryKeys.github.prChecks(root),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data === undefined || !data.hasPullRequest) return false;
      return data.summary.pending > 0 ? CHECKS_POLL_MS : false;
    },
    retry: false,
    staleTime: 5_000,
  });

  const fixMutation = useMutation({
    mutationFn: async () => {
      const result = await api.github.prChecksFixPrompt({ cwd: root });
      if (!is.nonEmptyString(chatId)) {
        throw new Error(t("workspace.tools.checks.fixNeedsChat"));
      }
      await startRun({
        input: { chatId },
        message: {
          attachments: [],
          content: [{ text: result.prompt, type: "text" }],
          createdAt: new Date(),
          metadata: { custom: {} },
          parentId: null,
          role: "user",
          runConfig: undefined,
          sourceId: null,
        },
        slotKey: chatId,
      });
      return result;
    },
  });

  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.github.prChecks(root),
    });
  };

  useLayoutEffect(() => {
    if (!focus) return;
    const node = sectionRef.current;
    if (node === null) return;
    node.scrollIntoView({ behavior: "smooth", block: "nearest" });
    setHighlighted(true);
    setExpandedOverride(true);
    onFocusHandled?.();
  }, [focus, onFocusHandled]);

  useEffect(() => {
    if (!highlighted) return;
    const timer = window.setTimeout(() => setHighlighted(false), 1600);
    return () => window.clearTimeout(timer);
  }, [highlighted]);

  const data = checksQuery.data;
  const failedCount = data?.summary.fail ?? 0;
  const pendingCount = data?.summary.pending ?? 0;
  const passCount = data?.summary.pass ?? 0;
  const totalCount = data?.summary.total ?? data?.checks.length ?? 0;
  const allPassed =
    data !== undefined &&
    totalCount > 0 &&
    failedCount === 0 &&
    pendingCount === 0;
  const defaultExpanded = !allPassed;
  const expanded = expandedOverride ?? defaultExpanded;

  const orderedChecks = useMemo(() => {
    const checks = data?.checks ?? [];
    return [...checks].sort(
      (left, right) =>
        checkBucketRank[left.bucket] - checkBucketRank[right.bucket],
    );
  }, [data?.checks]);

  if (checksQuery.isError) {
    return (
      <section
        className="space-y-2 border-t border-border-subtle pt-3"
        data-testid="workspace-checks-section"
        id={workspacePullRequestChecksSectionId}
        ref={sectionRef}
      >
        <h3 className="text-xs font-medium">
          {t("workspace.tools.checks.sectionTitle")}
        </h3>
        <WorkspaceToolBanner tone="danger">
          {getErrorMessage(checksQuery.error)}
        </WorkspaceToolBanner>
      </section>
    );
  }

  if (checksQuery.isLoading || data === undefined) {
    return (
      <section
        className="space-y-2 border-t border-border-subtle pt-3"
        data-testid="workspace-checks-section"
        id={workspacePullRequestChecksSectionId}
        ref={sectionRef}
      >
        <h3 className="text-xs font-medium">
          {t("workspace.tools.checks.sectionTitle")}
        </h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <CircleNotch className="size-3.5 animate-spin" weight="bold" />
          {t("workspace.tools.pullRequest.checking")}
        </div>
      </section>
    );
  }

  // Parent owns the no-PR empty state; stay quiet if the branch lost its PR.
  if (!data.hasPullRequest || data.pullRequest === null) {
    return null;
  }

  return (
    <section
      className={cn(
        "space-y-2 border-t border-border-subtle pt-3",
        highlighted && "rounded-md ring-2 ring-primary/40 ring-offset-2",
      )}
      data-testid="workspace-checks-section"
      id={workspacePullRequestChecksSectionId}
      ref={sectionRef}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
          onClick={() => setExpandedOverride(!expanded)}
          type="button"
        >
          <CaretDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              !expanded && "-rotate-90",
            )}
          />
          <h3 className="text-xs font-medium">
            {t("workspace.tools.checks.sectionTitle")}
          </h3>
          {allPassed && !expanded ? (
            <span className="truncate text-xs text-status-success">
              {t("workspace.tools.checks.allPassed", { count: passCount })}
            </span>
          ) : (
            <span className="truncate text-[11px] text-muted-foreground">
              {t("workspace.tools.checks.summaryPass", { count: passCount })}
              {" · "}
              {t("workspace.tools.checks.summaryFail", { count: failedCount })}
              {" · "}
              {t("workspace.tools.checks.summaryPending", {
                count: pendingCount,
              })}
            </span>
          )}
          <span className="sr-only">
            {expanded
              ? t("workspace.tools.checks.collapse")
              : t("workspace.tools.checks.expand")}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {failedCount > 0 ? (
            <Button
              disabled={fixMutation.isPending || !is.nonEmptyString(chatId)}
              size="xs"
              variant="secondary"
              onClick={() => fixMutation.mutate()}
            >
              {fixMutation.isPending
                ? t("workspace.tools.checks.fixing")
                : t("workspace.tools.checks.fixFailures")}
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" onClick={refresh}>
            <ArrowClockwise
              className={cn(
                "size-3.5",
                checksQuery.isFetching ? "animate-spin" : undefined,
              )}
            />
            <span className="sr-only">
              {t("workspace.tools.checks.refresh")}
            </span>
          </Button>
        </div>
      </div>

      {fixMutation.isError ? (
        <WorkspaceToolBanner className="shrink-0" tone="danger">
          {getErrorMessage(fixMutation.error)}
        </WorkspaceToolBanner>
      ) : null}
      {fixMutation.isSuccess ? (
        <WorkspaceToolBanner className="shrink-0" tone="attention">
          {t("workspace.tools.checks.fixStarted")}
        </WorkspaceToolBanner>
      ) : null}
      {!is.nonEmptyString(chatId) && failedCount > 0 ? (
        <WorkspaceToolBanner className="shrink-0" tone="attention">
          {t("workspace.tools.checks.fixNeedsChat")}
        </WorkspaceToolBanner>
      ) : null}

      {expanded ? (
        orderedChecks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("workspace.tools.empty.noChecks")}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle/60 rounded-md border border-border-subtle/70">
            {orderedChecks.map((check) => (
              <CheckRow
                check={check}
                key={`${check.name}:${check.workflow ?? ""}:${check.link ?? ""}`}
                onOpenLink={
                  is.nonEmptyString(check.link)
                    ? () => openBrowserTab(check.link as string)
                    : undefined
                }
              />
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
};

/** @deprecated Standalone panel removed; use WorkspaceChecksSection. */
export const WorkspaceChecksPanel = WorkspaceChecksSection;

function CheckRow({
  check,
  onOpenLink,
}: {
  check: GitHubPrCheck;
  onOpenLink?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <CheckStatusIcon bucket={check.bucket} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {check.name}
          </span>
          <span className="shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {check.state}
          </span>
        </div>
        {is.nonEmptyString(check.workflow) ? (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {check.workflow}
          </div>
        ) : null}
        {is.nonEmptyString(check.description) ? (
          <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
            {check.description}
          </div>
        ) : null}
      </div>
      {onOpenLink !== undefined ? (
        <Button
          className="shrink-0"
          size="xs"
          variant="ghost"
          onClick={onOpenLink}
        >
          <ArrowSquareOut className="size-3.5" />
          <span className="sr-only">
            {t("workspace.tools.checks.openCheck")}
          </span>
        </Button>
      ) : null}
    </li>
  );
}

function CheckStatusIcon({ bucket }: { bucket: GitHubCheckBucket }) {
  switch (bucket) {
    case "pass":
      return (
        <CheckCircle
          className="mt-0.5 size-4 shrink-0 text-status-success"
          weight="fill"
        />
      );
    case "fail":
      return (
        <XCircle
          className="mt-0.5 size-4 shrink-0 text-status-danger"
          weight="fill"
        />
      );
    case "pending":
      return (
        <CircleNotch
          className="mt-0.5 size-4 shrink-0 animate-spin text-status-attention"
          weight="bold"
        />
      );
    case "cancel":
    case "skipping":
      return (
        <WarningCircle
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          weight="fill"
        />
      );
  }
}
