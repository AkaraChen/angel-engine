import type { ChatSessionUsage } from "@angel-engine/js-client";
import { useTranslation } from "react-i18next";
import { cn } from "@/platform/utils";
import { formatUsageTokens } from "./format";

export function ContextUsageBar({ usage }: { usage?: ChatSessionUsage }) {
  const { t } = useTranslation();
  if (!usage || usage.used <= 0) return null;

  const hasSize = usage.size > 0;
  const ratio = hasSize ? usage.used / usage.size : undefined;
  const warning = ratio !== undefined && ratio >= 0.7;
  const danger = ratio !== undefined && ratio >= 0.9;
  const label = hasSize
    ? `${formatUsageTokens(usage.used)} / ${formatUsageTokens(usage.size)}`
    : formatUsageTokens(usage.used);

  return (
    <div
      className="mb-1.5"
      title={danger ? t("usage.contextNearLimit") : t("usage.contextUsed")}
    >
      {hasSize ? (
        <div className="h-0.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full bg-muted-foreground/45 transition-[width]",
              warning && "bg-status-attention",
              danger && "bg-status-danger",
            )}
            style={{ width: `${Math.min(100, (ratio ?? 0) * 100)}%` }}
          />
        </div>
      ) : null}
      {warning || !hasSize ? (
        <p
          className={cn(
            "mt-1 text-right font-mono text-[10px] text-muted-foreground",
            danger && "text-status-danger",
          )}
        >
          {danger ? `${t("usage.contextNearLimit")} · ${label}` : label}
        </p>
      ) : null}
    </div>
  );
}
