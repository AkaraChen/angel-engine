import type {
  CapabilityMatrix,
  CheckRun,
  CheckRunStatus,
} from "@angel-engine/daemon-api/source-control";
import {
  ArrowClockwise,
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleNotch,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  WorkspaceToolBanner,
  WorkspaceToolEmpty,
} from "@/app/workspace/workspace-tool-layout";
import { useWorkspaceToolStore } from "@/app/workspace/workspace-tool-store";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { CapabilityGate } from "@/features/source-control/components/capability-gate";
import { capabilityState } from "@/features/source-control/model";
import { checksSummaryQueryOptions } from "@/features/pull-request/api/queries";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

export function WorkspaceChecksSection({
  capabilities,
  changeRequestId,
  projectPath,
  providerIdentity,
}: {
  capabilities: CapabilityMatrix;
  changeRequestId: string | null;
  projectPath: string | null;
  providerIdentity: string | null;
}) {
  const { active, api, openBrowserTab } = useWorkspaceToolSurface();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const chatId = useWorkspaceToolStore((state) => state.context.chatId);
  const startRun = useChatRunStore((state) => state.startRun);
  const [expanded, setExpanded] = useState(true);
  const checksCapability = capabilityState(capabilities, "checks.snapshot");
  const fixCapability = capabilityState(capabilities, "checks.fixPrompt");

  const checksQuery = useQuery(
    checksSummaryQueryOptions({
      active,
      api,
      changeRequestId,
      projectPath,
      providerIdentity,
      supported: checksCapability.supported,
    }),
  );

  const fixMutation = useMutation({
    mutationFn: async () => {
      const result = await api.sourceControl.checksFixPrompt(
        projectPath ?? "",
        changeRequestId ?? "",
      );
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
      queryKey: queryKeys.sourceControl.checksSummary(
        providerIdentity,
        changeRequestId,
      ),
    });
  }, [changeRequestId, providerIdentity, queryClient]);

  const data = checksQuery.data;
  const allPassed =
    data !== undefined && data.checks.length > 0 && data.requiredAllGreen;
  useEffect(() => {
    if (data !== undefined) setExpanded(!allPassed);
  }, [allPassed, data]);

  const sortedChecks = useMemo(
    () => [...(data?.checks ?? [])].sort(compareChecks),
    [data],
  );

  if (!checksCapability.supported) {
    return (
      <section
        className="space-y-2 border-t border-border-subtle pt-3"
        data-testid="workspace-checks-unsupported"
        id="workspace-tool-checks-section"
      >
        <h3 className="text-xs font-medium">
          {t("workspace.tools.tabs.checks")}
        </h3>
        <p className="text-xs text-muted-foreground">
          {checksCapability.reason.message}
        </p>
        <CapabilityGate
          capabilities={capabilities}
          capability="checks.snapshot"
        >
          <Button size="sm" variant="outline">
            {t("workspace.tools.tabs.checks")}
          </Button>
        </CapabilityGate>
      </section>
    );
  }

  if (checksQuery.isError) {
    return (
      <ChecksSectionShell>
        <WorkspaceToolBanner tone="danger">
          {getErrorMessage(checksQuery.error)}
        </WorkspaceToolBanner>
      </ChecksSectionShell>
    );
  }
  if (checksQuery.isLoading || data === undefined) {
    return <ChecksSectionShell />;
  }

  const failedCount = data.failed.length;
  const pendingCount = data.checks.filter(isPending).length;
  const passCount = data.checks.filter(isPassing).length;

  return (
    <section
      className="space-y-2 border-t border-border-subtle pt-3 transition-colors"
      data-testid="workspace-checks-section"
      id="workspace-tool-checks-section"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-xs font-medium"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <CaretDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <CaretRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span>{t("workspace.tools.tabs.checks")}</span>
          {allPassed ? (
            <span className="truncate font-normal text-status-success">
              {t("workspace.tools.checks.summaryPass", {
                count: data.checks.length,
              })}
            </span>
          ) : null}
        </button>
        <Button size="xs" variant="ghost" onClick={refresh}>
          <ArrowClockwise
            className={cn(checksQuery.isFetching && "animate-spin")}
          />
          <span className="sr-only">{t("workspace.tools.checks.refresh")}</span>
        </Button>
      </div>
      {expanded ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <SummaryChip
              label={t("workspace.tools.checks.summaryPass", {
                count: passCount,
              })}
              tone="pass"
            />
            <SummaryChip
              label={t("workspace.tools.checks.summaryFail", {
                count: failedCount,
              })}
              tone="fail"
            />
            <SummaryChip
              label={t("workspace.tools.checks.summaryPending", {
                count: pendingCount,
              })}
              tone="pending"
            />
            {failedCount > 0 ? (
              <CapabilityGate
                capabilities={capabilities}
                capability="checks.fixPrompt"
              >
                <Button
                  className="ml-auto"
                  disabled={
                    !fixCapability.supported ||
                    fixMutation.isPending ||
                    !is.nonEmptyString(chatId) ||
                    projectPath === null ||
                    changeRequestId === null
                  }
                  size="xs"
                  variant="secondary"
                  onClick={() => fixMutation.mutate()}
                >
                  {fixMutation.isPending
                    ? t("workspace.tools.checks.fixing")
                    : t("workspace.tools.checks.fixFailures")}
                </Button>
              </CapabilityGate>
            ) : null}
          </div>
          {failedCount > 0 && !fixCapability.supported ? (
            <p
              className="text-xs text-muted-foreground"
              data-testid="workspace-checks-fix-unsupported"
            >
              {fixCapability.reason.message}
            </p>
          ) : null}
          {!is.nonEmptyString(chatId) && failedCount > 0 ? (
            <WorkspaceToolBanner tone="attention">
              {t("workspace.tools.checks.fixNeedsChat")}
            </WorkspaceToolBanner>
          ) : null}
          {fixMutation.isError ? (
            <WorkspaceToolBanner tone="danger">
              {getErrorMessage(fixMutation.error)}
            </WorkspaceToolBanner>
          ) : null}
          {fixMutation.isSuccess ? (
            <WorkspaceToolBanner tone="attention">
              {t("workspace.tools.checks.fixStarted")}
            </WorkspaceToolBanner>
          ) : null}
          {sortedChecks.length === 0 ? (
            <WorkspaceToolEmpty
              icon={CheckCircle}
              title={t("workspace.tools.empty.noChecks")}
            />
          ) : (
            <ul className="divide-y divide-border-subtle/60 rounded-md border border-border-subtle">
              {sortedChecks.map((check) => (
                <CheckRow
                  check={check}
                  key={check.id}
                  onOpenLink={
                    check.detailsUrl
                      ? () => openBrowserTab(check.detailsUrl as string)
                      : undefined
                  }
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}

function ChecksSectionShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-2 border-t border-border-subtle pt-3">
      <h3 className="text-xs font-medium">
        {t("workspace.tools.tabs.checks")}
      </h3>
      {children}
    </section>
  );
}

function CheckRow({
  check,
  onOpenLink,
}: {
  check: CheckRun;
  onOpenLink?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <CheckStatusIcon check={check} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{check.name}</span>
          <span className="shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
            {check.conclusion ?? check.status}
          </span>
        </div>
        {check.group?.name ? (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {check.group.name}
          </div>
        ) : null}
      </div>
      {onOpenLink ? (
        <Button size="xs" variant="ghost" onClick={onOpenLink}>
          <ArrowSquareOut />
          <span className="sr-only">
            {t("workspace.tools.checks.openCheck")}
          </span>
        </Button>
      ) : null}
    </li>
  );
}

function CheckStatusIcon({ check }: { check: CheckRun }) {
  if (isPending(check))
    return <CircleNotch className="animate-spin text-status-attention" />;
  if (check.conclusion === "success")
    return <CheckCircle className="text-status-success" weight="fill" />;
  if (check.conclusion === "failure" || check.conclusion === "timed-out") {
    return <XCircle className="text-status-danger" weight="fill" />;
  }
  return <WarningCircle className="text-muted-foreground" weight="fill" />;
}

function compareChecks(left: CheckRun, right: CheckRun) {
  return (
    checkRank(left) - checkRank(right) || left.name.localeCompare(right.name)
  );
}

function checkRank(check: CheckRun) {
  if (check.conclusion === "failure" || check.conclusion === "timed-out")
    return 0;
  if (isPending(check)) return 1;
  if (check.conclusion === "success") return 3;
  return 2;
}

function isPending(check: { status: CheckRunStatus }) {
  return (
    check.status === "queued" ||
    check.status === "running" ||
    check.status === "waiting-manual"
  );
}

function isPassing(check: CheckRun) {
  return (
    check.conclusion === "success" ||
    check.conclusion === "neutral" ||
    check.conclusion === "skipped"
  );
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
