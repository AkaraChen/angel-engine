import type { FormEvent, KeyboardEvent } from "react";
import type { ConversationMessage } from "@/platform/chat-types";

import { ArrowUp, ChatCircle, Square, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Bubble, BubbleContent } from "@/components/ui/bubble";
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
import { ComposerPlanMode } from "@/features/chat/composer-plan-mode";
import { ElicitationPrompt } from "@/features/chat/elicitation-prompt";
import { MarkdownMessage } from "@/features/chat/markdown-message";
import { PlanMessage } from "@/features/chat/plan-message";
import { ToolCallGroup } from "@/features/chat/tool-call-group";
import {
  type Conversation,
  useConversation,
} from "@/features/chat/use-conversation";

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
              {conversation.isPending && !hasMessages ? (
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

      <Composer conversation={conversation} />
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const hasTools = message.toolCalls.length > 0;
  const hasPlans = message.plans.length > 0;
  // Fall back to reasoning when a turn produced only reasoning (no prose) so the
  // bubble is never empty; show "Thinking…" only before any token has arrived.
  const body = message.text.length > 0 ? message.text : message.reasoning;
  const isReasoningOnly =
    message.text.length === 0 && message.reasoning.length > 0;
  // Don't show "Thinking…" once tool/plan cards are on screen — they already
  // convey that the turn is in progress (parity with the desktop thread).
  const isTyping =
    message.status === "streaming" &&
    body.length === 0 &&
    !hasTools &&
    !hasPlans;
  // A pure tool-call/plan turn has cards but no prose/error/typing: skip the
  // bubble.
  const showBubble = isUser || isError || isTyping || body.length > 0;
  // Only the assistant's final prose gets markdown/typeset rendering; user,
  // error, reasoning-only and typing states stay plain text.
  const renderMarkdown = !isUser && !isError && !isTyping && !isReasoningOnly;

  return (
    <MessageGroup>
      <Message align={isUser ? "end" : "start"}>
        <MessageContent className="flex flex-col gap-2">
          {!isUser && hasTools ? (
            <ToolCallGroup
              calls={message.toolCalls}
              collapsed={message.text.length > 0 || hasPlans}
            />
          ) : null}
          {!isUser && hasPlans
            ? message.plans.map((plan, index) => (
                <PlanMessage
                  isStreaming={message.status === "streaming"}
                  key={`${message.id}-plan-${plan.kind ?? "review"}-${index}`}
                  plan={plan}
                />
              ))
            : null}
          {showBubble ? (
            <Bubble
              align={isUser ? "end" : "start"}
              variant={isError ? "destructive" : isUser ? "default" : "muted"}
            >
              <BubbleContent
                className={renderMarkdown ? undefined : "whitespace-pre-wrap"}
              >
                {isTyping ? (
                  <Marker>
                    <MarkerIcon>
                      <Spinner className="size-3.5" />
                    </MarkerIcon>
                    <MarkerContent>{t("chat.thinking")}</MarkerContent>
                  </Marker>
                ) : isError ? (
                  <span className="flex items-center gap-1.5">
                    <Warning className="shrink-0" size={16} weight="fill" />
                    {message.error ?? t("chat.turnFailed")}
                  </span>
                ) : isReasoningOnly ? (
                  <span className="text-muted-foreground italic">{body}</span>
                ) : renderMarkdown ? (
                  <MarkdownMessage
                    content={body}
                    isStreaming={message.status === "streaming"}
                  />
                ) : (
                  body
                )}
              </BubbleContent>
            </Bubble>
          ) : null}
        </MessageContent>
      </Message>
    </MessageGroup>
  );
}

function Composer({ conversation }: { conversation: Conversation }) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const isStreaming = conversation.isStreaming;
  const canSend = value.trim().length > 0 && !isStreaming;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    conversation.send(value);
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
          aria-label={t("chat.messagePlaceholder")}
          className="max-h-40 min-h-11"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={t("chat.messagePlaceholder")}
          value={value}
        />
        <InputGroupAddon align="block-end" className="justify-between gap-2">
          <ComposerPlanMode
            config={conversation.runtimeConfig}
            disabled={isStreaming || conversation.isModePending}
            onSetMode={conversation.setMode}
            onSetPermissionMode={conversation.setPermissionMode}
          />
          {isStreaming ? (
            <InputGroupButton
              aria-label={t("chat.stopAria")}
              onClick={conversation.stop}
              size="icon-sm"
              variant="secondary"
            >
              <Square size={16} weight="fill" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              aria-label={t("chat.sendAria")}
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
  const { t } = useTranslation();
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChatCircle size={28} />
        </EmptyMedia>
        <EmptyTitle>{t("chat.emptyTitle")}</EmptyTitle>
        <EmptyDescription>{t("chat.emptyDescription")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Warning size={28} />
        </EmptyMedia>
        <EmptyTitle>{t("chat.errorTitle")}</EmptyTitle>
        <EmptyDescription>{t("common.daemonOfflineHint")}</EmptyDescription>
      </EmptyHeader>
      <button
        className="text-sm font-medium text-primary underline underline-offset-4"
        onClick={onRetry}
        type="button"
      >
        {t("common.tryAgain")}
      </button>
    </Empty>
  );
}
