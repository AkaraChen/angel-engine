import {
  AuiIf,
  SelectionToolbarPrimitive,
  ThreadPrimitive,
} from '@assistant-ui/react';
import { Quote, Sparkles } from 'lucide-react';

import { AssistantComposer } from '@/chat/assistant-composer';
import {
  AssistantMessage,
  UserEditComposer,
  UserMessage,
} from '@/chat/messages';

export function AssistantThread() {
  return (
    <ThreadPrimitive.Root className="flex h-full min-h-0 flex-col">
      <ThreadPrimitive.Viewport
        className="relative flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5 sm:px-6"
        scrollToBottomOnRunStart
      >
        <AuiIf condition={(state) => state.thread.isEmpty}>
          <EmptyThread />
        </AuiIf>

        <ThreadPrimitive.Messages>
          {({ message }) => {
            if (message.role === 'user') {
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

function EmptyThread() {
  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-5 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-md border bg-muted/40">
        <Sparkles className="size-5" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">Start a desktop run</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe the workspace slice to inspect.
        </p>
      </div>
    </div>
  );
}
