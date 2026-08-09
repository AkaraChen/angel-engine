import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  SettingsGroup,
  SettingsRow,
} from "@/features/settings/settings-controls";
import { queryKeys } from "@/platform/query-keys";
import { CCUSAGE_SUPPORTED_AGENTS } from "@angel-engine/usage-collector/correlate";
import { useSettingsStore } from "@/features/settings/settings-store";
import { refreshUsageSnapshot, usageSnapshotQueryOptions } from "./api/queries";
import {
  formatEstimatedCost,
  formatUsageTime,
  formatUsageTokens,
} from "./format";

const BURN_RATE_THRESHOLDS = [10, 25, 50, 100] as const;

export function UsageSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const burnRateThreshold = useSettingsStore(
    (state) => state.usageBurnRateThreshold,
  );
  const burnRateWarningEnabled = useSettingsStore(
    (state) => state.usageBurnRateWarningEnabled,
  );
  const setBurnRateThreshold = useSettingsStore(
    (state) => state.setUsageBurnRateThreshold,
  );
  const setBurnRateWarningEnabled = useSettingsStore(
    (state) => state.setUsageBurnRateWarningEnabled,
  );
  const usageQuery = useQuery(usageSnapshotQueryOptions());
  const refresh = useMutation({
    mutationFn: refreshUsageSnapshot,
    onSuccess: (data) =>
      queryClient.setQueryData(queryKeys.usage.snapshot(), data),
  });
  const availability = usageQuery.data;

  if (usageQuery.isPending || availability?.kind === "collecting") {
    return <UsageNotice text={t("usage.collecting")} />;
  }
  if (usageQuery.isError || availability?.kind === "unavailable") {
    const reason =
      availability?.kind === "unavailable"
        ? t(`usage.unavailableReasons.${availability.reason}`)
        : t("usage.unavailable");
    return (
      <UsageNotice
        action={
          <Button
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
            size="sm"
            variant="outline"
          >
            {t("usage.refresh")}
          </Button>
        }
        text={reason}
      />
    );
  }
  if (availability?.kind !== "ok") return null;

  const { report } = availability;
  const periods = [
    [t("usage.today"), report.periods.today],
    [t("usage.week"), report.periods.week],
    [t("usage.month"), report.periods.month],
  ] as const;

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {periods.map(([label, total]) => (
          <section
            className="rounded-xl border border-border-subtle bg-card px-4 py-3 shadow-xs"
            key={label}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-mono text-lg tabular-nums">
              {formatEstimatedCost(total.costUsd)}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {formatUsageTokens(total.tokens)} {t("usage.tokens")}
            </p>
          </section>
        ))}
      </div>

      <SettingsGroup title={t("usage.byAgent")}>
        {report.agentTotals.length === 0 ? (
          <SettingsRow after={null} title={t("usage.noData")} />
        ) : (
          report.agentTotals.map((agent) => (
            <SettingsRow
              after={
                <span className="font-mono text-xs tabular-nums">
                  {formatEstimatedCost(agent.costUsd)}
                </span>
              }
              description={`${formatUsageTokens(agent.tokens)} ${t("usage.tokens")}`}
              key={agent.agent}
              title={agent.agent}
            />
          ))
        )}
      </SettingsGroup>

      <SettingsGroup title={t("usage.source")}>
        <SettingsRow
          after={
            <Button
              disabled={refresh.isPending}
              onClick={() => refresh.mutate()}
              size="sm"
              variant="outline"
            >
              {t("usage.refresh")}
            </Button>
          }
          description={`${t("usage.sourceDescription", {
            agents: CCUSAGE_SUPPORTED_AGENTS.join(", "),
          })} ${t("usage.lastCollected", {
            time: formatUsageTime(report.collectedAt),
          })}`}
          title={`ccusage ${report.ccusageVersion}`}
        />
      </SettingsGroup>

      <SettingsGroup title={t("usage.warnings")}>
        <SettingsRow
          after={
            <Switch
              aria-label={t("usage.burnRateWarning")}
              checked={burnRateWarningEnabled}
              onCheckedChange={setBurnRateWarningEnabled}
            />
          }
          description={t("usage.burnRateWarningDescription")}
          title={t("usage.burnRateWarning")}
        />
        {burnRateWarningEnabled ? (
          <SettingsRow
            after={
              <NativeSelect
                aria-label={t("usage.burnRateThreshold")}
                onChange={(event) =>
                  setBurnRateThreshold(Number(event.currentTarget.value))
                }
                size="sm"
                value={String(burnRateThreshold)}
              >
                {BURN_RATE_THRESHOLDS.map((threshold) => (
                  <NativeSelectOption key={threshold} value={String(threshold)}>
                    ${threshold}/h
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            }
            title={t("usage.burnRateThreshold")}
          />
        ) : null}
      </SettingsGroup>
    </>
  );
}

function UsageNotice({ action, text }: { action?: ReactNode; text: string }) {
  return (
    <SettingsGroup>
      <SettingsRow after={action ?? null} title={text} />
    </SettingsGroup>
  );
}
