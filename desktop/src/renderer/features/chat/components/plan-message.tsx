import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { ChatPlanData } from "@angel-engine/daemon-api/chat";
import type { TFunction } from "i18next";

import { useAui, useAuiState } from "@assistant-ui/react";
import {
  Check,
  CaretDown as ChevronDown,
  Circle,
  DotOutline as CircleDot,
  FileText,
  Hammer,
  GitBranch as Handoff,
  ListChecks,
  SpinnerGap as Loader2,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { cjk } from "@streamdown/cjk";
import { code as streamdownCode } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { agentRuntimeIconSvg } from "@/features/agents/agent-runtime-icons";
import {
  assistantTextContainerClassName,
  inspectorCardClassName,
} from "@/features/chat/components/message-styles";
import { nativeControlRowClass } from "@/features/chat/components/thread-styles";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";
import { findPlanModeToggleTarget } from "@/features/chat/runtime/mode-options";
import { useChatRuntimeActions } from "@/features/chat/runtime/use-chat-runtime-actions";
import { usePlanHandoff } from "@/features/chat/runtime/use-plan-handoff";
import { cn } from "@/platform/utils";

function PlanMessagePart({ plan }: { plan: ChatPlanData }) {
  const { t } = useTranslation();
  const aui = useAui();
  const chatOptions = useChatOptions();
  const handoffPlan = usePlanHandoff();
  const { setMode, setPermissionMode } = useChatRuntimeActions();
  const toast = useToast();
  const isLastMessage = useAuiState((state) => state.message.isLast);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [open, setOpen] = useState(true);
  const [startingImplementation, setStartingImplementation] = useState(false);
  const completed = plan.entries.filter(
    (entry) => entry.status === "completed",
  ).length;
  const isTodoPlan = plan.kind === "todo";
  const planTitle = isTodoPlan ? t("common.todo") : t("common.plan");
  const hasDetails = plan.entries.length > 0 || Boolean(plan.text);
  const target = findPlanModeToggleTarget([
    {
      canSet: chatOptions.canSetMode,
      family: "agent",
      options: chatOptions.modeOptions,
      value: chatOptions.mode,
    },
    {
      canSet: chatOptions.canSetPermissionMode,
      family: "permission",
      options: chatOptions.permissionModeOptions,
      value: chatOptions.permissionMode,
    },
  ]);
  const canStartImplementation =
    plan.kind === "review" &&
    !isRunning &&
    !startingImplementation &&
    !chatOptions.configLoading &&
    Boolean(target?.buildMode);
  const handoffAgents = chatOptions.runtimeOptions;
  const canHandoff =
    plan.kind === "review" && hasDetails && handoffAgents.length > 0;

  const handoffToAgent = (runtime: AgentRuntime) => {
    handoffPlan(runtime, buildPlanHandoffPrompt(plan, t)).catch((error) => {
      toast({
        description: getErrorMessage(error),
        title: t("messages.toasts.couldNotHandoffPlan"),
        variant: "destructive",
      });
    });
  };

  if (plan.presentation === "created" || plan.presentation === "updated") {
    return (
      <PlanMarkerPart
        kind={plan.kind ?? "review"}
        presentation={plan.presentation}
      />
    );
  }

  const startImplementation = async () => {
    if (!target?.buildMode || startingImplementation) return;
    setStartingImplementation(true);
    try {
      if (target.family === "agent") {
        await setMode(target.buildMode.value);
      } else {
        await setPermissionMode(target.buildMode.value);
      }
      aui.thread().append({
        content: [{ text: "start implementation", type: "text" }],
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("messages.toasts.couldNotStartImplementation"),
        variant: "destructive",
      });
    } finally {
      setStartingImplementation(false);
    }
  };

  return (
    <Collapsible
      className={inspectorCardClassName}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger
        className={cn(
          nativeControlRowClass,
          `
            flex min-h-10 w-full items-center gap-2 rounded-none px-3 py-2
            text-left
          `,
        )}
        disabled={!hasDetails}
        type="button"
      >
        <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{planTitle}</div>
          <div
            className="
              mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground
            "
          >
            {plan.entries.length > 0 ? (
              <span>
                {t("messages.completedCount", {
                  completed,
                  total: plan.entries.length,
                })}
              </span>
            ) : (
              <span>{t("common.draft")}</span>
            )}
            {is.nonEmptyString(plan.path) ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{plan.path}</span>
              </>
            ) : null}
          </div>
        </div>
        {hasDetails ? (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
        ) : null}
      </CollapsibleTrigger>
      {plan.entries.length > 0 ? (
        <div
          aria-hidden="true"
          className="
            mx-3 mb-1.5 h-0.5 overflow-hidden rounded-full bg-surface-2
          "
        >
          <div
            className="
              h-full rounded-full bg-primary transition-[width] duration-500
              ease-swift
            "
            style={{
              width: `${Math.round((completed / plan.entries.length) * 100)}%`,
            }}
          />
        </div>
      ) : null}
      {hasDetails ? (
        <CollapsibleContent
          className="
            overflow-hidden
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
          "
        >
          <div className="space-y-3 border-t border-border px-3 py-2.5">
            {is.nonEmptyString(plan.text) ? (
              <div className="p-2">
                <Streamdown
                  className={assistantTextContainerClassName}
                  controls={false}
                  linkSafety={{ enabled: false }}
                  lineNumbers={false}
                  mode="streaming"
                  plugins={{ cjk, code: streamdownCode, math, mermaid }}
                  shikiTheme={["vitesse-light", "vitesse-dark"]}
                >
                  {plan.text}
                </Streamdown>
              </div>
            ) : null}
            {is.nonEmptyString(plan.path) ? (
              <div
                className="
                  flex min-w-0 items-center gap-2 rounded-md bg-background/70
                  px-2 py-1.5 text-muted-foreground
                "
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  {plan.path}
                </span>
              </div>
            ) : null}
            {plan.entries.length > 0 ? (
              <ol className="space-y-2">
                {plan.entries.map((entry) => (
                  <li
                    className="flex min-w-0 gap-2"
                    key={`${entry.status}:${entry.content}`}
                  >
                    <PlanEntryStatusIcon status={entry.status} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm/5",
                        entry.status === "completed" &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {entry.content}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {isLastMessage && (canStartImplementation || canHandoff) ? (
              <div className="flex justify-end gap-2 border-t border-border pt-2">
                {canHandoff ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        className="group/button"
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Handoff className="size-3.5" />
                        {t("messages.handoff")}
                        <ChevronDown
                          className="
                            size-3.5 shrink-0 text-muted-foreground/80
                            transition-transform duration-150
                            group-data-[state=open]/button:rotate-180
                          "
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-52 min-w-0"
                      sideOffset={4}
                      variant="native"
                    >
                      <DropdownMenuLabel>
                        {t("messages.handoffMenuLabel")}
                      </DropdownMenuLabel>
                      {handoffAgents.map((agent) => (
                        <PlanHandoffAgentItem
                          key={agent.value}
                          label={agent.label}
                          onSelect={() => {
                            handoffToAgent(agent.value);
                          }}
                          runtime={agent.value}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
                {canStartImplementation ? (
                  <Button
                    onClick={() => {
                      void startImplementation();
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {startingImplementation ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Hammer className="size-3.5" />
                    )}
                    {t("messages.startImplementation")}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function PlanHandoffAgentItem({
  label,
  onSelect,
  runtime,
}: {
  label: string;
  onSelect: () => void;
  runtime: AgentRuntime;
}) {
  const iconSvg = agentRuntimeIconSvg(runtime);

  return (
    <DropdownMenuItem className="gap-2" onSelect={onSelect}>
      {is.nonEmptyString(iconSvg) ? (
        <span
          aria-hidden="true"
          className="
            flex size-3.5 shrink-0 items-center justify-center
            text-muted-foreground
            [&_svg]:size-3.5 [&_svg]:shrink-0
          "
          // oxlint-disable-next-line react/no-danger -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml -- Static bundled runtime icons need inline SVG to inherit local icon styling.
          dangerouslySetInnerHTML={{ __html: iconSvg }}
        />
      ) : (
        <Handoff className="size-3.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </DropdownMenuItem>
  );
}

function buildPlanHandoffPrompt(plan: ChatPlanData, t: TFunction): string {
  const sections: string[] = [t("messages.handoffPromptIntro")];
  if (is.nonEmptyString(plan.text)) {
    sections.push(plan.text.trim());
  }
  if (plan.entries.length > 0) {
    sections.push(
      plan.entries
        .map((entry, index) => `${index + 1}. ${entry.content}`)
        .join("\n"),
    );
  }
  if (is.nonEmptyString(plan.path)) {
    sections.push(t("messages.handoffPromptPlanFile", { path: plan.path }));
  }
  return sections.join("\n\n");
}

function PlanMarkerPart({
  kind,
  presentation,
}: {
  kind: "review" | "todo";
  presentation: "created" | "updated";
}) {
  const { t } = useTranslation();
  const title = kind === "todo" ? t("common.todo") : t("common.plan");
  const presentationLabel =
    presentation === "created" ? t("messages.created") : t("common.updated");

  return (
    <div
      className="
        flex min-h-10 w-full items-center gap-2 rounded-lg bg-surface-1/50 px-3
        py-2 text-xs shadow-panel
      "
    >
      <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="truncate font-medium">
        {t("messages.planMarker", {
          presentation: presentationLabel,
          title,
        })}
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function PlanEntryStatusIcon({
  status,
}: {
  status: ChatPlanData["entries"][number]["status"];
}) {
  switch (status) {
    case "completed":
      return <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" />;
    case "in_progress":
      return (
        <CircleDot className="mt-0.5 size-3.5 shrink-0 text-status-attention" />
      );
    case "pending":
      return (
        <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    default:
      return (
        <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
  }
}

export { PlanMessagePart };
