import { ArrowsClockwise as RefreshIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryKeys } from "@/platform/query-keys";
import { useActiveChatRunCount } from "@/features/chat/state/chat-run-store";
import { useSettingsStore } from "@/features/settings/settings-store";
import { cn } from "@/platform/utils";
import { refreshUsageSnapshot, usageSnapshotQueryOptions } from "./api/queries";
import {
  billingBlockProgress,
  burnRateExceedsThreshold,
  formatDurationMinutes,
  formatEstimatedCost,
  formatUsageTime,
  formatUsageTokens,
} from "./format";

export function UsageChip() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeRunCount = useActiveChatRunCount();
  const burnRateThreshold = useSettingsStore(
    (state) => state.usageBurnRateThreshold,
  );
  const burnRateWarningEnabled = useSettingsStore(
    (state) => state.usageBurnRateWarningEnabled,
  );
  const usageQuery = useQuery(usageSnapshotQueryOptions());
  const refresh = useMutation({
    mutationFn: refreshUsageSnapshot,
    onSuccess: (data) =>
      queryClient.setQueryData(queryKeys.usage.snapshot(), data),
  });
  const availability = usageQuery.data;
  if (availability?.kind !== "ok" || !availability.report.activeBlock)
    return null;

  const block = availability.report.activeBlock;
  const progress = billingBlockProgress(block.startTime, block.endTime);
  const burnRateWarning = burnRateExceedsThreshold(
    block.burnRate.costPerHour,
    burnRateWarningEnabled,
    burnRateThreshold,
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "hidden shrink-0 rounded-md px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground hover:bg-overlay-hover hover:text-foreground sm:block",
            burnRateWarning && "bg-status-attention/10 text-status-attention",
          )}
          data-electron-no-drag
          type="button"
        >
          {formatEstimatedCost(block.costUsd)} ·{" "}
          {formatDurationMinutes(block.projection.remainingMinutes)}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-3" variant="apple">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium">{t("usage.activeBlock")}</p>
            <p className="mt-1 font-mono text-lg tabular-nums">
              {formatEstimatedCost(block.costUsd)}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-muted-foreground">{t("usage.activeRuns")}</dt>
            <dd className="text-right font-mono tabular-nums">
              {activeRunCount}
            </dd>
            <dt className="text-muted-foreground">{t("usage.burnRate")}</dt>
            <dd
              className={cn(
                "text-right font-mono tabular-nums",
                burnRateWarning && "text-status-attention",
              )}
            >
              {formatEstimatedCost(block.burnRate.costPerHour)}/h
            </dd>
            <dt className="text-muted-foreground">{t("usage.projected")}</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatEstimatedCost(block.projection.totalCost)}
            </dd>
          </dl>
          {burnRateWarning ? (
            <p className="rounded-md bg-status-attention/10 px-2 py-1.5 text-xs text-status-attention">
              {t("usage.burnRateWarningActive", {
                threshold: `$${burnRateThreshold}/h`,
              })}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/55"
                style={{ width: `${(progress ?? 0) * 100}%` }}
              />
            </div>
            <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
              <span>{formatUsageTime(block.startTime)}</span>
              <span>{formatUsageTime(block.endTime)}</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-1 text-[11px]">
            <dt className="text-muted-foreground">{t("usage.inputTokens")}</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatUsageTokens(block.tokenCounts.input)}
            </dd>
            <dt className="text-muted-foreground">{t("usage.outputTokens")}</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatUsageTokens(block.tokenCounts.output)}
            </dd>
            <dt className="text-muted-foreground">
              {t("usage.cacheReadTokens")}
            </dt>
            <dd className="text-right font-mono tabular-nums">
              {formatUsageTokens(block.tokenCounts.cacheRead)}
            </dd>
            <dt className="text-muted-foreground">
              {t("usage.cacheCreationTokens")}
            </dt>
            <dd className="text-right font-mono tabular-nums">
              {formatUsageTokens(block.tokenCounts.cacheCreation)}
            </dd>
          </dl>
          <p className="truncate text-[11px] text-muted-foreground">
            {block.models.join(", ")}
          </p>
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border-subtle px-2 py-1.5 text-xs hover:bg-overlay-hover disabled:opacity-50"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
            type="button"
          >
            <RefreshIcon className="size-3.5" />
            {t("usage.refresh")}
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
