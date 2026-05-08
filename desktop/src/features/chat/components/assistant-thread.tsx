import {
  AuiIf,
  SelectionToolbarPrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { Quote, Sparkles } from "lucide-react";

import { AssistantComposer } from "@/features/chat/components/assistant-composer";
import {
  AssistantMessage,
  UserEditComposer,
  UserMessage,
} from "@/features/chat/components/messages";

export function AssistantThread({ projectName }: { projectName?: string }) {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
      <ThreadPrimitive.Viewport
        className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-6"
        scrollToBottomOnRunStart
      >
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <EmptyThread projectName={projectName} />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.role === "user") {
              if (message.composer.isEditing) return <UserEditComposer />;
              return <UserMessage />;
            }
            return <AssistantMessage />;
          }}
        </ThreadPrimitive.Messages>

        <SelectionToolbarPrimitive.Root className="z-20 flex items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
          <SelectionToolbarPrimitive.Quote className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-xs hover:bg-muted">
            <Quote className="size-3" />
            Quote
          </SelectionToolbarPrimitive.Quote>
        </SelectionToolbarPrimitive.Root>
      </ThreadPrimitive.Viewport>
      <div className="shrink-0 bg-background px-4 pb-4 pt-2 sm:px-6">
        <AssistantComposer />
      </div>
    </ThreadPrimitive.Root>
  );
}

function EmptyThread({ projectName }: { projectName?: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-5 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-md border bg-muted/40">
        <Sparkles className="size-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">
          {projectName ? (
            <>
              Start a run in <ProjectNameUnderline name={projectName} />
            </>
          ) : (
            "Start a desktop run"
          )}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {projectName
            ? `Ask Angel Engine to inspect, patch, or test ${projectName}.`
            : "Describe the workspace slice to inspect."}
        </p>
      </div>
    </div>
  );
}

function ProjectNameUnderline({ name }: { name: string }) {
  return (
    <span className="relative inline-block max-w-full align-baseline text-primary">
      <span className="relative z-10 break-words">{name}</span>
      <svg
        aria-hidden
        className="pointer-events-none absolute -bottom-1.5 -left-[5%] h-3 w-[110%] overflow-visible text-primary/70"
        focusable="false"
        preserveAspectRatio="none"
        viewBox="0 0 120 12"
      >
        <path
          d="M3 7.8 C13 3.1 24 10.4 35 6.2 C48 1.3 55 8.6 67 6.8 C78 5.2 81 2.6 91 4.9 C101 7.3 108 6.7 117 3.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.55"
        />
      </svg>
    </span>
  );
}
