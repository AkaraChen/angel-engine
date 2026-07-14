import type { ConversationToolCall } from "@/platform/chat-types";

import {
  CaretDown,
  SpinnerGap,
  WarningCircle,
  Wrench,
} from "@phosphor-icons/react";
import { useState } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  isRunningToolPhase,
  toolGroupLabel,
} from "@/features/chat/message-view";
import { ToolCallCard } from "@/features/chat/tool-call-card";
import { cn } from "@/lib/utils";

/**
 * Groups a turn's tool calls into a single collapsible summary — the mobile
 * counterpart to the desktop `ToolGroup`. While the assistant is still working
 * (no prose yet) the group stays open so live tool progress is visible; once the
 * turn produces streamed text it auto-collapses to one summary line the reader
 * can tap to re-expand. A manual toggle always wins over the auto behaviour.
 */
export function ToolCallGroup({
  calls,
  collapsed,
}: {
  calls: ConversationToolCall[];
  collapsed: boolean;
}) {
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open = manualOpen ?? !collapsed;
  const active = calls.some((call) => isRunningToolPhase(call.phase));
  const failed = !active && calls.some((call) => call.isError);

  return (
    <Collapsible
      className="w-full max-w-[90%]"
      onOpenChange={setManualOpen}
      open={open}
    >
      <CollapsibleTrigger
        className="
          flex min-h-9 w-full items-center gap-2 rounded-lg py-1 text-left
          text-xs font-medium text-muted-foreground transition-colors
          hover:text-foreground
        "
        type="button"
      >
        <GroupStatusIcon active={active} failed={failed} />
        <span className="min-w-0 flex-1 truncate">{toolGroupLabel(calls)}</span>
        <CaretDown
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            !open && "-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="
          overflow-hidden
          data-[state=closed]:animate-collapsible-up
          data-[state=open]:animate-collapsible-down
        "
      >
        <div className="mt-1.5 flex flex-col gap-1.5">
          {calls.map((call) => (
            <ToolCallCard call={call} key={call.id} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function GroupStatusIcon({
  active,
  failed,
}: {
  active: boolean;
  failed: boolean;
}) {
  if (active)
    return (
      <SpinnerGap className="size-4 shrink-0 animate-spin text-primary/75" />
    );
  if (failed)
    return <WarningCircle className="size-4 shrink-0 text-destructive" />;
  return <Wrench className="size-4 shrink-0" />;
}
