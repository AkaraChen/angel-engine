import type { ConversationToolCall } from "@/platform/chat-types";

import {
  CaretDown,
  Check,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  formatToolPhase,
  isRunningToolPhase,
} from "@/features/chat/message-view";
import { cn } from "@/lib/utils";

/**
 * A compact, touch-friendly card for a single inline tool call — the mobile
 * counterpart to the desktop `ToolActionMessagePart`. Shows the tool name, a
 * status icon, and the lifecycle phase in the header; input / output / error
 * detail collapses away by default and expands on tap. Collapsed-first keeps the
 * transcript scannable on a small screen.
 */
export function ToolCallCard({ call }: { call: ConversationToolCall }) {
  const running = isRunningToolPhase(call.phase);
  const failed = call.isError;
  const hasDetails =
    call.argsText.length > 0 ||
    call.outputText.length > 0 ||
    call.errorText.length > 0;
  const [open, setOpen] = useState(false);
  const isOpen = hasDetails && open;

  return (
    <Collapsible
      className="
        w-full max-w-[90%] overflow-hidden rounded-xl border border-border
        bg-card text-sm
      "
      onOpenChange={setOpen}
      open={isOpen}
    >
      <ToolCallHeader
        details={hasDetails}
        failed={failed}
        name={call.name}
        open={isOpen}
        phase={call.phase}
        running={running}
        summary={call.summary}
      />
      {hasDetails ? (
        <CollapsibleContent
          className="
            overflow-hidden
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
          "
        >
          <div className="space-y-2 border-t border-border p-2.5">
            {call.argsText.length > 0 ? (
              <ToolPreBlock label="Input" value={call.argsText} />
            ) : null}
            {call.errorText.length > 0 ? (
              <ToolPreBlock label="Error" tone="error" value={call.errorText} />
            ) : null}
            {call.errorText.length === 0 && call.outputText.length > 0 ? (
              <ToolPreBlock label="Output" value={call.outputText} />
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function ToolCallHeader({
  details,
  failed,
  name,
  open,
  phase,
  running,
  summary,
}: {
  details: boolean;
  failed: boolean;
  name: string;
  open: boolean;
  phase: string;
  running: boolean;
  summary: string;
}) {
  const content = (
    <>
      <ToolStatusIcon failed={failed} running={running} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-foreground/90">{name}</span>
        {summary.length > 0 ? (
          <span className="truncate text-xs text-muted-foreground/75">
            {summary}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground/75">
        {formatToolPhase(phase)}
      </span>
      {details ? (
        <CaretDown
          className={cn(
            `
              size-3.5 shrink-0 text-muted-foreground/70 transition-transform
              duration-200
            `,
            !open && "-rotate-90",
          )}
        />
      ) : null}
    </>
  );

  const className =
    "flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left";

  if (!details) return <div className={className}>{content}</div>;
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
    return <WarningCircle className="size-4 shrink-0 text-destructive" />;
  if (running)
    return (
      <SpinnerGap className="size-4 shrink-0 animate-spin text-primary/75" />
    );
  return <Check className="size-4 shrink-0 text-muted-foreground/75" />;
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
          tone === "error" && "text-destructive",
        )}
      >
        {label}
      </div>
      <pre
        className="
          max-h-48 overflow-auto rounded-md border border-border bg-muted/40 p-2
          font-mono text-[11px]/4 wrap-break-word whitespace-pre-wrap
        "
      >
        {value}
      </pre>
    </div>
  );
}
