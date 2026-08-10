import type {
  AgentOption,
  AgentReadinessStatus,
} from "@angel-engine/daemon-api/agents";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const CLOSED: AgentReadinessStatus[] = [
  "ready",
  "authentication-required",
  "unavailable",
  "checking",
  "error",
];

export function readinessStatusOf(agent: AgentOption): AgentReadinessStatus {
  const status = agent.readiness?.status;
  return status && (CLOSED as string[]).includes(status) ? status : "checking";
}

export function isClosedAgentReadinessStatus(
  value: unknown,
): value is AgentReadinessStatus {
  return typeof value === "string" && (CLOSED as string[]).includes(value);
}

/**
 * Protocol-neutral readiness label + optional Test again action.
 * Does not branch on provider names — only closed status enum.
 */
export function AgentReadinessLabel({
  agent,
  className,
  onTestAgain,
}: {
  agent: AgentOption;
  className?: string;
  onTestAgain?: () => void;
}) {
  const { t } = useTranslation();
  const status = readinessStatusOf(agent);
  const labelDefaults: Record<AgentReadinessStatus, string> = {
    "authentication-required": "Authentication required",
    checking: "Checking…",
    error: "Error",
    ready: "Ready",
    unavailable: "Unavailable",
  };
  const label = t(`settings.agents.readiness.${status}`, {
    defaultValue: labelDefaults[status],
  });
  const detail = agent.readiness?.detail;
  const showRetest =
    onTestAgain !== undefined &&
    (status === "unavailable" ||
      status === "error" ||
      status === "authentication-required");

  return (
    <span
      className={cn(
        "inline-flex max-w-full flex-wrap items-center gap-1.5 text-xs",
        className,
      )}
      title={detail}
    >
      <span
        className={cn(
          "text-muted-foreground",
          status === "error" && "text-status-danger",
          status === "authentication-required" && "text-status-attention",
          status === "ready" && "text-status-success",
        )}
      >
        <span className="sr-only">
          {t("settings.agents.readiness.prefix", {
            defaultValue: "Status:",
          })}{" "}
        </span>
        {label}
        {detail ? (
          <span className="text-muted-foreground/80"> — {detail}</span>
        ) : null}
      </span>
      {showRetest ? (
        <Button
          className="h-8 px-2 text-xs"
          onClick={onTestAgain}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("settings.agents.readiness.testAgain", {
            defaultValue: "Test again",
          })}
        </Button>
      ) : null}
    </span>
  );
}
