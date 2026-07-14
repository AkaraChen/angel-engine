import type { FormEvent, KeyboardEvent } from "react";
import type {
  ChatElicitationResponse,
  ConversationMessage,
  DaemonElicitation,
} from "@/platform/chat-types";

import {
  ArrowUp,
  ChatCircle,
  ShieldCheck,
  Square,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker";
import { Message, MessageContent, MessageGroup } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useConversation } from "@/features/chat/use-conversation";

/**
 * The mobile conversation view: a scrollable transcript rendered with the shadcn
 * chat primitives (MessageScroller + Message + Bubble) over a keyboard-aware
 * composer (InputGroup). Message history and the streamed assistant reply come
 * from {@link useConversation}.
 */
export function ChatPage({ chatId }: { chatId: string }) {
  const conversation = useConversation(chatId);
  const hasMessages = conversation.messages.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScrollerProvider>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport className="h-full">
            <MessageScrollerContent className="gap-4 p-4">
              {conversation.isPending ? (
                <TranscriptSkeleton />
              ) : conversation.isError && !hasMessages ? (
                <ErrorState onRetry={conversation.refetch} />
              ) : !hasMessages ? (
                <EmptyState />
              ) : (
                conversation.messages.map((message) => (
                  <MessageScrollerItem key={message.id}>
                    <MessageBubble message={message} />
                  </MessageScrollerItem>
                ))
              )}
              {conversation.pendingElicitation !== null ? (
                <MessageScrollerItem scrollAnchor>
                  <ElicitationPrompt
                    elicitation={conversation.pendingElicitation}
                    onRespond={conversation.respondElicitation}
                  />
                </MessageScrollerItem>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <Composer
        isStreaming={conversation.isStreaming}
        onSend={conversation.send}
        onStop={conversation.stop}
      />
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.role === "user";
  const isError = message.status === "error";
  // Fall back to reasoning when a turn produced only reasoning (no prose) so the
  // bubble is never empty; show "Thinking…" only before any token has arrived.
  const body = message.text.length > 0 ? message.text : message.reasoning;
  const isReasoningOnly =
    message.text.length === 0 && message.reasoning.length > 0;
  const isTyping = message.status === "streaming" && body.length === 0;

  return (
    <MessageGroup>
      <Message align={isUser ? "end" : "start"}>
        <MessageContent>
          <Bubble
            align={isUser ? "end" : "start"}
            variant={isError ? "destructive" : isUser ? "default" : "muted"}
          >
            <BubbleContent className="whitespace-pre-wrap">
              {isTyping ? (
                <Marker>
                  <MarkerIcon>
                    <Spinner className="size-3.5" />
                  </MarkerIcon>
                  <MarkerContent>Thinking…</MarkerContent>
                </Marker>
              ) : isError ? (
                <span className="flex items-center gap-1.5">
                  <Warning className="shrink-0" size={16} weight="fill" />
                  {message.error ?? "The assistant turn failed."}
                </span>
              ) : isReasoningOnly ? (
                <span className="text-muted-foreground italic">{body}</span>
              ) : (
                body
              )}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </MessageGroup>
  );
}

const APPROVAL_KINDS = new Set(["Approval", "PermissionProfile"]);

function ElicitationPrompt({
  elicitation,
  onRespond,
}: {
  elicitation: DaemonElicitation;
  onRespond: (response: ChatElicitationResponse) => void;
}) {
  const isApproval = APPROVAL_KINDS.has(elicitation.kind);
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <ShieldCheck
          className="shrink-0 text-primary"
          size={16}
          weight="fill"
        />
        {elicitation.title ?? "The agent needs your input"}
      </div>
      {elicitation.body !== null && elicitation.body !== undefined ? (
        <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">
          {elicitation.body}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {isApproval ? (
          <>
            <Button onClick={() => onRespond({ type: "allow" })} size="sm">
              Allow
            </Button>
            <Button
              onClick={() => onRespond({ type: "allowForSession" })}
              size="sm"
              variant="outline"
            >
              Allow for session
            </Button>
            <Button
              onClick={() => onRespond({ type: "deny" })}
              size="sm"
              variant="outline"
            >
              Deny
            </Button>
          </>
        ) : (
          <Button
            onClick={() => onRespond({ type: "cancel" })}
            size="sm"
            variant="outline"
          >
            Dismiss
          </Button>
        )}
      </div>
    </div>
  );
}

function Composer({
  isStreaming,
  onSend,
  onStop,
}: {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [value, setValue] = useState("");
  const canSend = value.trim().length > 0 && !isStreaming;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    onSend(value);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline (parity with the desktop
    // composer on keyboards that expose a hardware/return key).
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit(event);
    }
  }

  return (
    <form
      className="
        shrink-0 border-t border-border p-2
        pb-[max(0.5rem,env(safe-area-inset-bottom))]
      "
      onSubmit={submit}
    >
      <InputGroup>
        <InputGroupTextarea
          aria-label="Message"
          className="max-h-40 min-h-11"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message"
          value={value}
        />
        <InputGroupAddon align="inline-end">
          {isStreaming ? (
            <InputGroupButton
              aria-label="Stop"
              onClick={onStop}
              size="icon-sm"
              variant="secondary"
            >
              <Square size={16} weight="fill" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              aria-label="Send"
              disabled={!canSend}
              size="icon-sm"
              type="submit"
              variant="default"
            >
              <ArrowUp size={16} weight="bold" />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

function TranscriptSkeleton() {
  const rows = [
    { align: "start", width: "w-3/5" },
    { align: "end", width: "w-2/5" },
    { align: "start", width: "w-4/5" },
  ] as const;
  return (
    <>
      {rows.map((row) => (
        <div
          className={row.align === "end" ? "flex justify-end" : "flex"}
          key={row.width}
        >
          <Skeleton className={`h-12 rounded-xl ${row.width}`} />
        </div>
      ))}
    </>
  );
}

function EmptyState() {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChatCircle size={28} />
        </EmptyMedia>
        <EmptyTitle>No messages yet</EmptyTitle>
        <EmptyDescription>
          Send a message to start the conversation.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Warning size={28} />
        </EmptyMedia>
        <EmptyTitle>Couldn&apos;t load this chat</EmptyTitle>
        <EmptyDescription>
          The daemon may be offline or unreachable.
        </EmptyDescription>
      </EmptyHeader>
      <button
        className="text-sm font-medium text-primary underline underline-offset-4"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </Empty>
  );
}
