import type {
  AgentOption,
  AgentReadinessStatus,
} from "@angel-engine/daemon-api/agents";

import { useTranslation } from "react-i18next";

import { invalidateAgentCatalog } from "@/features/agents/agent-catalog-resource";
import { cn } from "@/platform/utils";

const STATUS_ORDER: AgentReadinessStatus[] = [
  "ready",
  "authentication-required",
  "unavailable",
  "checking",
  "error",
];

export function isClosedAgentReadinessStatus(
  value: unknown,
): value is AgentReadinessStatus {
  return (
    typeof value === "string" && (STATUS_ORDER as string[]).includes(value)
  );
}

export function readinessStatusOf(agent: AgentOption): AgentReadinessStatus {
  const status = agent.readiness?.status;
  return isClosedAgentReadinessStatus(status) ? status : "checking";
}

export function AgentReadinessBadge({
  agent,
  className,
}: {
  agent: AgentOption;
  className?: string;
}) {
  const { t } = useTranslation();
  const status = readinessStatusOf(agent);
  const label = t(`settings.agents.readiness.${status}`);
  const detail = agent.readiness?.detail;
  const showRetest =
    status === "unavailable" ||
    status === "error" ||
    status === "authentication-required";

  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1.5 text-xs",
        className,
      )}
      title={detail}
    >
      <span
        aria-hidden
        className={cn(
          "inline-flex size-2.5 shrink-0 items-center justify-center rounded-sm border",
          status === "ready" &&
            "border-status-success bg-status-success text-status-success",
          status === "authentication-required" &&
            "border-status-attention bg-status-attention/20",
          status === "unavailable" && "border-muted-foreground/50 bg-muted",
          status === "checking" && "border-muted-foreground/40 bg-transparent",
          status === "error" && "border-status-danger bg-status-danger/15",
        )}
      >
        {status === "ready" ? (
          <span className="size-1 rounded-full bg-status-success-foreground/0" />
        ) : status === "error" ? (
          <span className="text-[8px] leading-none text-status-danger">!</span>
        ) : status === "authentication-required" ? (
          <span className="text-[8px] leading-none text-status-attention">
            ?
          </span>
        ) : status === "unavailable" ? (
          <span className="size-1.5 border-t border-muted-foreground/70" />
        ) : (
          <span className="size-1 animate-pulse rounded-full bg-muted-foreground/50" />
        )}
      </span>
      <span className="text-muted-foreground truncate">
        <span className="sr-only">
          {t("settings.agents.readiness.prefix")}{" "}
        </span>
        {label}
        {detail ? (
          <span className="text-muted-foreground/80"> — {detail}</span>
        ) : null}
      </span>
      {showRetest ? (
        <button
          className="text-primary-strong shrink-0 underline-offset-2 hover:underline"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            invalidateAgentCatalog();
          }}
          type="button"
        >
          {t("settings.agents.readiness.testAgain", {
            defaultValue: "Test again",
          })}
        </button>
      ) : null}
    </span>
  );
}
