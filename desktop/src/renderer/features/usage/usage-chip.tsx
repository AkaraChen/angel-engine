import { ArrowsClockwise as RefreshIcon } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { queryKeys } from "@/platform/query-keys";
import { refreshUsageSnapshot, usageSnapshotQueryOptions } from "./api/queries";
import { formatEstimatedCost } from "./format";

export function UsageChip() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="shrink-0 rounded-md px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground hover:bg-overlay-hover hover:text-foreground"
          data-electron-no-drag
          type="button"
        >
          {formatEstimatedCost(block.costUsd)} ·{" "}
          {block.projection.remainingMinutes}m
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
            <dt className="text-muted-foreground">{t("usage.burnRate")}</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatEstimatedCost(block.burnRate.costPerHour)}/h
            </dd>
            <dt className="text-muted-foreground">{t("usage.projected")}</dt>
            <dd className="text-right font-mono tabular-nums">
              {formatEstimatedCost(block.projection.totalCost)}
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
