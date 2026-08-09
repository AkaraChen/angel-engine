import type {
  GitHubCheckBucket,
  GitHubPrCheck,
} from "@angel-engine/daemon-api/github";
import type { WorkspaceToolPanelLayout } from "@/app/workspace/workspace-files-panels";

import {
  ArrowClockwise,
  ArrowSquareOut,
  CheckCircle,
  CircleNotch,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  WorkspaceToolBanner,
  WorkspaceToolEmpty,
} from "@/app/workspace/workspace-tool-layout";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

const CHECKS_POLL_MS = 15_000;

export function WorkspaceChecksPanel({
  active,
  layout,
  root,
  onOpenBrowser,
}: {
  active: boolean;
  layout: WorkspaceToolPanelLayout;
  root: string;
  onOpenBrowser: (url: string) => void;
}) {
  const { api } = useWorkspaceToolSurface();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const chatId = useWorkspaceToolStore((state) => state.context.chatId);
  const startRun = useChatRunStore((state) => state.startRun);

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

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.github.prChecks(root),
    });
  }, [queryClient, root]);

  if (checksQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(checksQuery.error)}
        icon={CheckCircle}
        title={t("workspace.tools.empty.checksUnavailable")}
      />
    );
  }

  if (checksQuery.isLoading || checksQuery.data === undefined) {
    return null;
  }

  const data = checksQuery.data;
  if (!data.hasPullRequest || data.pullRequest === null) {
    return (
      <WorkspaceToolEmpty
        detail={t("workspace.tools.empty.noPullRequestDetail")}
        icon={CheckCircle}
        title={t("workspace.tools.empty.noPullRequest")}
      />
    );
  }

  const pr = data.pullRequest;
  const failedCount = data.summary.fail;
  const split = layout === "split";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className={cn(
          "flex shrink-0 flex-col gap-2 border-b border-border-subtle/70",
          split ? "px-4 py-3" : "px-3 py-2.5",
        )}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              #{pr.number}{" "}
              <span className="font-normal text-muted-foreground">
                {pr.title}
              </span>
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {pr.headRefName}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              onClick={() => onOpenBrowser(pr.url)}
            >
              <ArrowSquareOut className="size-3.5" />
              <span className="sr-only">
                {t("workspace.tools.checks.openPullRequest")}
              </span>
            </Button>
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
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <SummaryChip
            label={t("workspace.tools.checks.summaryPass", {
              count: data.summary.pass,
            })}
            tone="pass"
          />
          <SummaryChip
            label={t("workspace.tools.checks.summaryFail", {
              count: data.summary.fail,
            })}
            tone="fail"
          />
          <SummaryChip
            label={t("workspace.tools.checks.summaryPending", {
              count: data.summary.pending,
            })}
            tone="pending"
          />
          {failedCount > 0 ? (
            <Button
              className="ml-auto"
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
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {data.checks.length === 0 ? (
          <WorkspaceToolEmpty
            icon={CheckCircle}
            title={t("workspace.tools.empty.noChecks")}
          />
        ) : (
          <ul className="divide-y divide-border-subtle/60">
            {data.checks.map((check) => (
              <CheckRow
                check={check}
                key={`${check.name}:${check.workflow ?? ""}:${check.link ?? ""}`}
                onOpenLink={
                  is.nonEmptyString(check.link)
                    ? () => onOpenBrowser(check.link as string)
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

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

function SummaryChip({
  label,
  tone,
}: {
  label: string;
  tone: "fail" | "pass" | "pending";
}) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-medium",
        tone === "pass" && "bg-status-success-soft text-status-success",
        tone === "fail" && "bg-status-danger-soft text-status-danger",
        tone === "pending" && "bg-status-attention-soft text-status-attention",
      )}
    >
      {label}
    </span>
  );
}
