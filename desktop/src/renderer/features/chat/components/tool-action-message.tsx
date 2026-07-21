import type {
  ChatToolAction,
  ChatToolActionOutput,
} from "@angel-engine/daemon-api/chat";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import type { TFunction } from "i18next";

import { isChatToolAction } from "@angel-engine/daemon-api/chat";
import { useAuiState } from "@assistant-ui/react";
import {
  WarningCircle as AlertCircleIcon,
  Check,
  CaretDown as ChevronDown,
  SpinnerGap as Loader2,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toolCallCardClassName } from "@/features/chat/components/message-styles";
import { cn } from "@/platform/utils";

function ToolActionMessagePart(part: ToolCallMessagePartProps) {
  const action = isChatToolAction(part.artifact) ? part.artifact : undefined;
  return <GenericToolActionMessagePart action={action} part={part} />;
}

function GenericToolActionMessagePart({
  action,
  part,
}: {
  action?: ChatToolAction;
  part: ToolCallMessagePartProps;
}) {
  const { t } = useTranslation();
  const phase = action?.phase ?? part.status.type;
  const title = is.nonEmptyString(action?.title)
    ? action.title
    : is.nonEmptyString(action?.inputSummary)
      ? action.inputSummary
      : part.toolName;
  const outputText = getToolOutputText(action, part.result);
  const errorText = action?.error?.message;
  const isRunning = isRunningToolPhase(phase);
  const isFailed = is.nonEmptyString(errorText) || phase === "failed";
  const hasDetails =
    is.nonEmptyString(part.argsText) ||
    is.nonEmptyString(outputText) ||
    is.nonEmptyString(errorText);
  const hasTextAfterTool = useHasTextAfterToolCall(part.toolCallId);
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open = hasDetails && (manualOpen ?? !hasTextAfterTool);
  if (isBareHostCapabilityToolAction(action, title, outputText, errorText)) {
    return null;
  }

  return (
    <Collapsible
      className={toolCallCardClassName}
      onOpenChange={setManualOpen}
      open={open}
    >
      <ToolActionHeader
        details={hasDetails}
        failed={isFailed}
        open={open}
        phase={phase}
        running={isRunning}
        title={title}
      />
      {hasDetails && (
        <CollapsibleContent
          className="
            overflow-hidden
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
          "
        >
          <div className="space-y-2 border-t border-border p-2.5">
            {is.nonEmptyString(part.argsText) ? (
              <ToolPreBlock
                label={t("messages.tool.input")}
                value={part.argsText}
              />
            ) : null}
            {is.nonEmptyString(errorText) ? (
              <ToolPreBlock
                label={t("common.error")}
                tone="error"
                value={errorText}
              />
            ) : null}
            {!is.nonEmptyString(errorText) && is.nonEmptyString(outputText) ? (
              <ToolPreBlock
                label={t("messages.tool.output")}
                value={outputText}
              />
            ) : null}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

function isBareHostCapabilityToolAction(
  action: ChatToolAction | undefined,
  title: string,
  outputText: string,
  errorText?: string,
) {
  if (action?.kind !== "hostCapability") return false;
  if (is.nonEmptyString(outputText) || is.nonEmptyString(errorText)) {
    return false;
  }
  if (
    action.output?.some((output: ChatToolActionOutput) =>
      is.nonEmptyString(output.text),
    ) === true
  ) {
    return false;
  }
  return title === "hostCapability" || title === "User input requested";
}

function useHasTextAfterToolCall(toolCallId: string) {
  return useAuiState((state) => {
    const toolIndex = state.message.parts.findIndex(
      (part) => part.type === "tool-call" && part.toolCallId === toolCallId,
    );
    return hasTextContentAfterIndex(state.message.parts, toolIndex);
  });
}

function hasTextContentAfterIndex(
  parts: readonly { text?: string; type: string }[],
  index: number,
) {
  for (
    let partIndex = Math.max(0, index + 1);
    partIndex < parts.length;
    partIndex += 1
  ) {
    const part = parts[partIndex];
    if (part?.type === "text" && is.nonEmptyString(part.text)) return true;
  }
  return false;
}

function ToolActionHeader({
  details,
  failed,
  open,
  phase,
  running,
  title,
}: {
  details: boolean;
  failed: boolean;
  open: boolean;
  phase: string;
  running: boolean;
  title: string;
}) {
  const { t } = useTranslation();
  const phaseLabel = formatToolPhase(phase, t);
  const statusKey = failed ? "failed" : running ? "running" : "done";
  const content = (
    <>
      <span
        className="
          flex shrink-0 animate-in items-center justify-center duration-200
          fade-in-0 zoom-in-75
        "
        key={statusKey}
      >
        <ToolStatusIcon failed={failed} running={running} />
      </span>
      <div className="min-w-0 flex-1 truncate font-medium text-foreground/90">
        {title}
      </div>
      <span className="shrink-0 text-[12px] text-muted-foreground/75">
        {phaseLabel}
      </span>
      {details && (
        <ChevronDown
          className={cn(
            `
              size-3.5 shrink-0 text-muted-foreground/70 transition-transform
              duration-200 ease-swift
            `,
            !open && "-rotate-90",
          )}
        />
      )}
    </>
  );

  const className = cn(
    "flex min-h-8 w-full items-center gap-2 px-2.5 py-1.5 text-left",
  );

  if (!details) {
    return <div className={className}>{content}</div>;
  }

  return (
    <CollapsibleTrigger className={className} type="button">
      {content}
    </CollapsibleTrigger>
  );
}

function ToolStatusIcon({
  failed,
  running,
}: {
  failed: boolean;
  running: boolean;
}) {
  if (failed)
    return <AlertCircleIcon className="size-3.5 shrink-0 text-status-danger" />;
  if (running) {
    return (
      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary/75" />
    );
  }
  return <Check className="size-3.5 shrink-0 text-muted-foreground/75" />;
}

function ToolPreBlock({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "error";
  value: string;
}) {
  return (
    <div>
      <div
        className={cn(
          "mb-1 text-[11px] font-medium text-muted-foreground uppercase",
          tone === "error" && "text-status-danger",
        )}
      >
        {label}
      </div>
      <pre
        className="
          max-h-48 overflow-auto rounded-md bg-surface-1/70 p-2.5 font-mono
          text-[11px]/4 wrap-break-word whitespace-pre-wrap
        "
      >
        {value}
      </pre>
    </div>
  );
}

function getToolOutputText(
  action: ChatToolAction | undefined,
  result: unknown,
) {
  if (is.nonEmptyString(action?.outputText)) return action.outputText;
  if (typeof result === "string") return result;
  if (result === undefined || result === null) return "";
  return JSON.stringify(result, null, 2);
}

function isRunningToolPhase(phase: string) {
  return (
    phase === "proposed" ||
    phase === "awaitingDecision" ||
    phase === "running" ||
    phase === "streamingResult"
  );
}

function formatToolPhase(phase: string, t: TFunction) {
  switch (phase) {
    case "awaitingDecision":
      return t("messages.tool.phase.awaitingDecision");
    case "streamingResult":
      return t("messages.tool.phase.streamingResult");
    case "completed":
      return t("common.completed");
    case "failed":
      return t("common.failed");
    case "declined":
      return t("common.declined");
    case "cancelled":
      return t("common.cancelled");
    case "running":
      return t("common.running");
    case "proposed":
      return t("common.proposed");
    default:
      return phase;
  }
}

export { ToolActionMessagePart };
