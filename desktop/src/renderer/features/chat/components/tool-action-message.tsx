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
  Brain,
  Check,
  CaretDown as ChevronDown,
  FileText,
  Globe,
  Image as ImageIcon,
  ListChecks,
  SpinnerGap as Loader2,
  PencilSimple,
  Plugs,
  Question,
  Robot,
  Terminal,
  Wrench,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toolCallCardClassName } from "@/features/chat/components/message-styles";
import {
  defaultToolDetailsOpen,
  densityForWorkspaceMode,
} from "@/features/chat/transcript-density";
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
  // The collapsed row leads with the tool identity in mono and trails with the
  // arguments, so a column of tool calls scans down the tool names. Only show
  // the summary when it actually says something the name did not.
  const summary =
    is.nonEmptyString(action?.inputSummary) && action.inputSummary !== title
      ? action.inputSummary
      : undefined;
  const outputText = getToolOutputText(action, part.result);
  const errorText = action?.error?.message;
  const isRunning = isRunningToolPhase(phase);
  const isAwaitingApproval = phase === "awaitingDecision";
  const isFailed = is.nonEmptyString(errorText) || phase === "failed";
  const hasDetails =
    is.nonEmptyString(part.argsText) ||
    is.nonEmptyString(outputText) ||
    is.nonEmptyString(errorText);
  const hasTextAfterTool = useHasTextAfterToolCall(part.toolCallId);
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const density = densityForWorkspaceMode(workspaceMode);
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open =
    hasDetails &&
    (manualOpen ?? defaultToolDetailsOpen(density, hasTextAfterTool));
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
        awaiting={isAwaitingApproval}
        details={hasDetails}
        failed={isFailed}
        kind={action?.kind}
        open={open}
        phase={phase}
        running={isRunning}
        summary={summary}
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
          {/* Input and output are separated by the same hairline that closes the
              header, so the body reads as two stacked sections rather than a
              list of boxes. */}
          <div
            className="
              divide-y divide-border-subtle border-t border-border-subtle
            "
          >
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
  awaiting,
  details,
  failed,
  kind,
  open,
  phase,
  running,
  summary,
  title,
}: {
  awaiting: boolean;
  details: boolean;
  failed: boolean;
  kind?: ChatToolAction["kind"];
  open: boolean;
  phase: string;
  running: boolean;
  summary?: string;
  title: string;
}) {
  const { t } = useTranslation();
  const phaseLabel = formatToolPhase(phase, t);
  const statusKey = failed
    ? "failed"
    : awaiting
      ? "awaiting"
      : running
        ? "running"
        : "done";
  const KindIcon = toolKindIcon(kind);
  const content = (
    <>
      <KindIcon className="size-3.5 shrink-0 text-muted-foreground" />
      {/* Both name and summary can shrink: a long tool title must not push the
          status and the caret off the row. */}
      <span className="min-w-0 truncate font-mono font-medium">{title}</span>
      {summary !== undefined ? (
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {summary}
        </span>
      ) : (
        <span className="flex-1" />
      )}
      <span
        className="
          shrink-0 text-[12px] tabular-nums text-muted-foreground/75
        "
      >
        {phaseLabel}
      </span>
      <span
        className="
          flex shrink-0 animate-in items-center justify-center duration-200
          fade-in-0 zoom-in-75
        "
        key={statusKey}
      >
        <ToolStatusIcon awaiting={awaiting} failed={failed} running={running} />
      </span>
      {details && (
        <ChevronDown
          className={cn(
            `
              size-3.5 shrink-0 text-muted-foreground/70 transition-transform
              duration-200 ease-standard
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

/** Phosphor regular, one per engine action kind. No second icon set. */
function toolKindIcon(kind?: ChatToolAction["kind"]) {
  switch (kind) {
    case "command":
      return Terminal;
    case "fileChange":
    case "write":
      return PencilSimple;
    case "read":
      return FileText;
    case "mcpTool":
      return Plugs;
    case "subAgent":
      return Robot;
    case "webSearch":
      return Globe;
    case "media":
      return ImageIcon;
    case "reasoning":
      return Brain;
    case "plan":
      return ListChecks;
    case "hostCapability":
      return Question;
    case "dynamicTool":
    case undefined:
      return Wrench;
    default:
      return Wrench;
  }
}

function ToolStatusIcon({
  awaiting,
  failed,
  running,
}: {
  awaiting: boolean;
  failed: boolean;
  running: boolean;
}) {
  if (failed) {
    return <AlertCircleIcon className="size-3.5 shrink-0 text-status-danger" />;
  }
  if (awaiting) {
    return <Question className="size-3.5 shrink-0 text-status-attention" />;
  }
  if (running) {
    return <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />;
  }
  return <Check className="size-3.5 shrink-0 text-status-success" />;
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
    <div className="p-2.5">
      <div
        className={cn(
          `
            mb-1 font-mono text-[11px] font-medium tracking-wide
            text-muted-foreground uppercase
          `,
          tone === "error" && "text-status-danger",
        )}
      >
        {label}
      </div>
      <pre
        className="
          max-h-48 overflow-auto font-mono text-[11px]/4 wrap-break-word
          whitespace-pre-wrap
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
