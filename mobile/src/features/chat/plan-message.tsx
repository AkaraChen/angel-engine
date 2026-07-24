import type { DaemonPlanData, DaemonPlanEntry } from "@/platform/chat-types";

import {
  CheckCircle,
  Circle,
  FileText,
  ListChecks,
  SpinnerGap,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

import { MarkdownMessage } from "./markdown-message";
import { chatPlanKind } from "./plan-utils";

/**
 * Mobile plan card: collapsible title + markdown body + todo checklist.
 * Created/updated presentations collapse to a one-line marker so only the
 * latest plan of each kind stays expanded (parity with desktop).
 */
export function PlanMessage({
  plan,
  isStreaming = false,
}: {
  plan: DaemonPlanData;
  isStreaming?: boolean;
}) {
  const { t } = useTranslation();
  const kind = chatPlanKind(plan);
  const title = kind === "todo" ? t("chat.todo") : t("chat.plan");

  if (plan.presentation === "created" || plan.presentation === "updated") {
    const label =
      plan.presentation === "created"
        ? t("chat.planCreated", { title })
        : t("chat.planUpdated", { title });
    return (
      <div
        className="
          flex items-center gap-2 rounded-lg border border-border bg-muted/40
          px-3 py-2 text-xs text-muted-foreground
        "
      >
        {kind === "todo" ? (
          <ListChecks className="size-3.5 shrink-0" weight="duotone" />
        ) : (
          <FileText className="size-3.5 shrink-0" weight="duotone" />
        )}
        <span>{label}</span>
      </div>
    );
  }

  const planText =
    typeof plan.text === "string" && plan.text.trim().length > 0
      ? plan.text
      : undefined;
  const completed = plan.entries.filter(
    (entry) => entry.status === "completed",
  ).length;
  const hasDetails = plan.entries.length > 0 || planText !== undefined;
  const [open, setOpen] = useState(true);

  return (
    <Collapsible
      className="overflow-hidden rounded-lg border border-border bg-card"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger
        className="
          flex w-full items-center gap-2 px-3 py-2 text-left text-sm
          font-medium
        "
      >
        {kind === "todo" ? (
          <ListChecks className="size-4 shrink-0" weight="duotone" />
        ) : (
          <FileText className="size-4 shrink-0" weight="duotone" />
        )}
        <span className="flex-1">{title}</span>
        {plan.entries.length > 0 ? (
          <span className="text-xs font-normal text-muted-foreground">
            {t("chat.planProgress", {
              completed,
              total: plan.entries.length,
            })}
          </span>
        ) : null}
        {isStreaming && plan.entries.length === 0 && !planText ? (
          <SpinnerGap className="size-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </CollapsibleTrigger>
      {hasDetails ? (
        <CollapsibleContent className="border-t border-border px-3 py-2">
          {planText !== undefined ? (
            <div className="mb-2 text-sm">
              <MarkdownMessage content={planText} isStreaming={isStreaming} />
            </div>
          ) : null}
          {plan.entries.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {plan.entries.map((entry, index) => (
                <PlanEntryRow entry={entry} key={`${entry.content}-${index}`} />
              ))}
            </ul>
          ) : null}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function PlanEntryRow({ entry }: { entry: DaemonPlanEntry }) {
  const Icon =
    entry.status === "completed"
      ? CheckCircle
      : entry.status === "in_progress"
        ? SpinnerGap
        : Circle;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          entry.status === "completed" && "text-emerald-600",
          entry.status === "in_progress" && "animate-spin text-primary",
          entry.status === "pending" && "text-muted-foreground",
        )}
        weight={entry.status === "completed" ? "fill" : "regular"}
      />
      <span
        className={cn(
          entry.status === "completed" && "text-muted-foreground line-through",
        )}
      >
        {entry.content}
      </span>
    </li>
  );
}
