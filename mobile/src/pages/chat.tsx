import type { FormEvent, KeyboardEvent } from "react";
import type { ConversationMessage } from "@/platform/chat-types";

import {
  ArrowClockwise,
  ArrowDown,
  ArrowUp,
  ChatCircle,
  File as FileIcon,
  Paperclip,
  Square,
  Warning,
  WarningOctagon,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { CollapsibleMessageBody } from "@/features/chat/collapsible-message-body";
import { ElicitationPrompt } from "@/features/chat/elicitation-prompt";
import { MarkdownMessage } from "@/features/chat/markdown-message";
import { MessageMetadata } from "@/features/chat/message-metadata";
import { PlanMessage } from "@/features/chat/plan-message";
import { ToolCallGroup } from "@/features/chat/tool-call-group";
import { useReadTerminalActivity } from "@/features/chat/use-activity";
import {
  type Conversation,
  useConversation,
} from "@/features/chat/use-conversation";
import {
  MOBILE_ATTACHMENT_ACCEPT,
  useComposerAttachments,
} from "@/features/chat/use-composer-attachments";
import { useKeyboardInset } from "@/features/chat/use-keyboard-inset";
import { cn } from "@/lib/utils";

/**
 * The mobile conversation view: a scrollable transcript rendered with the shadcn
 * chat primitives (MessageScroller + Message + Bubble) over a keyboard-aware
 * composer (InputGroup). Message history and the streamed assistant reply come
 * from {@link useConversation}.
 */
export function ChatPage({ chatId }: { chatId: string }) {
  const pendingInputRef = useRef<HTMLDivElement>(null);
  const conversation = useConversation(chatId);
  const hasMessages = conversation.messages.length > 0;
  // Acknowledging is irreversible, so it waits until the transcript is really
  // open: a chat that failed to load keeps its marker for the next attempt.
  const { failureMessage } = useReadTerminalActivity(chatId, {
    enabled: !conversation.isPending && !conversation.isError,
  });
  const reviewPendingInput = () => {
    pendingInputRef.current?.scrollIntoView({ block: "center" });
    pendingInputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MessageScrollerProvider>
        {conversation.pendingElicitation !== null ? (
          <AttentionBanner onReview={reviewPendingInput} />
        ) : null}
        {failureMessage !== undefined ? (
          <RunFailureBanner message={failureMessage} />
        ) : null}
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
                <MessageScrollerItem
                  className="
                    rounded-xl focus-visible:outline-2
                    focus-visible:outline-offset-2 focus-visible:outline-ring
                  "
                  ref={pendingInputRef}
                  scrollAnchor
                  tabIndex={-1}
                >
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

function AttentionBanner({ onReview }: { onReview: () => void }) {
  const { t } = useTranslation();
  return (
    <Alert
      className="
        mx-3 mt-2 mb-2 w-auto rounded-lg border-status-attention-border
        bg-status-attention-soft pr-28
      "
    >
      <Warning className="text-status-attention" weight="fill" />
      <AlertTitle>{t("chat.attentionNeedsInput")}</AlertTitle>
      <AlertDescription>
        {t("chat.attentionNeedsInputDescription")}
      </AlertDescription>
      <AlertAction>
        <Button className="h-9 px-3" onClick={onReview} variant="outline">
          {t("chat.attentionReview")}
          <ArrowDown data-icon="inline-end" />
        </Button>
      </AlertAction>
    </Alert>
  );
}

/**
 * The reason the last run failed. Opening the chat clears the daemon marker, so
 * this is the only place the message is still readable afterwards.
 */
function RunFailureBanner({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <Alert
      className="
        mx-3 mt-2 mb-2 w-auto rounded-lg border-status-danger-border
        bg-status-danger-soft
      "
    >
      <WarningOctagon className="text-status-danger" weight="fill" />
      <AlertTitle>{t("chat.runFailedTitle")}</AlertTitle>
      <AlertDescription className="wrap-anywhere">{message}</AlertDescription>
    </Alert>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const { t } = useTranslation();
  const isUser = message.role === "user";
  const isError = message.status === "error";
  const hasTools = message.toolCalls.length > 0;
  const hasPlans = message.plans.length > 0;
  const hasAttachments = message.attachments.length > 0;
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
    !hasPlans &&
    !hasAttachments;
  // A pure tool-call/plan turn has cards but no prose/error/typing: skip the
  // bubble.
  const showBubble = isUser || isError || isTyping || body.length > 0;
  // Only the assistant's final prose gets markdown/typeset rendering; user,
  // error, reasoning-only and typing states stay plain text.
  const renderMarkdown = !isUser && !isError && !isTyping && !isReasoningOnly;
  // Long user prompts collapse so they can't push the assistant reply off
  // screen (parity with the desktop thread).
  const collapseBody = isUser && !isError && !isTyping;

  return (
    <MessageGroup>
      <Message align={isUser ? "end" : "start"}>
        <MessageContent className="flex flex-col gap-2">
          <MessageMetadata message={message} />
          {hasAttachments ? (
            <div
              className={cn(
                "flex flex-wrap gap-2",
                isUser ? "justify-end" : "justify-start",
              )}
            >
              {message.attachments.map((attachment) => (
                <div
                  className="
                    flex max-w-[12rem] items-center gap-2 rounded-xl border
                    border-border-subtle bg-card px-2 py-1.5 text-xs
                  "
                  key={attachment.id}
                >
                  {attachment.type === "image" && attachment.dataUrl ? (
                    <img
                      alt={attachment.name}
                      className="size-10 rounded-md object-cover"
                      src={attachment.dataUrl}
                    />
                  ) : (
                    <FileIcon className="size-4 shrink-0" weight="duotone" />
                  )}
                  <span className="truncate">{attachment.name}</span>
                </div>
              ))}
            </div>
          ) : null}
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
            // Message typography follows the desktop thread: the user speaks in
            // a soft accent wash, the assistant has no bubble at all. The cap is
            // 88% rather than the desktop's 80% — on a 375px screen the extra
            // 8% is a whole word per line.
            <Bubble
              align={isUser ? "end" : "start"}
              className="max-w-[88%]"
              variant={isError ? "destructive" : isUser ? "default" : "ghost"}
            >
              <BubbleContent
                className={cn(
                  "text-sm",
                  // The `default` variant paints the bubble from the wrapper
                  // (`*:data-[slot=bubble-content]:bg-primary`), which outranks
                  // anything set here on specificity — hence the `!`.
                  isUser &&
                    !isError &&
                    "bg-primary-soft! text-primary-soft-foreground!",
                  !renderMarkdown && "whitespace-pre-wrap",
                )}
              >
                {collapseBody ? (
                  <CollapsibleMessageBody
                    fadeClassName="from-primary-soft"
                    toggleClassName="text-primary-soft-foreground"
                  >
                    {body}
                  </CollapsibleMessageBody>
                ) : isTyping ? (
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
  const [sendPending, setSendPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const draft = useComposerAttachments();
  const keyboardInset = useKeyboardInset();
  const isStreaming = conversation.isStreaming;
  // Attachment-only messages are valid; a reading or failed tile blocks Send
  // so a subset is never sent silently behind the user's back.
  const canSend =
    (value.trim().length > 0 || draft.readyAttachments.length > 0) &&
    !isStreaming &&
    !sendPending &&
    !draft.isReading &&
    !draft.hasErroredAttachment;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSend) return;
    const text = value;
    setSendPending(true);
    setSendError(null);
    try {
      const result = await conversation.send(text, draft.toInputs());
      if (!mountedRef.current) return;
      if (result.accepted) {
        setValue("");
        draft.clear();
        return;
      }
      if (result.error !== null) {
        setSendError(t("chat.sendFailed"));
      }
    } finally {
      if (mountedRef.current) setSendPending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter inserts a newline (parity with the desktop
    // composer on keyboards that expose a hardware/return key).
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(event);
    }
  }

  const attachmentErrorLabel =
    draft.error === "accept"
      ? t("chat.attachmentErrors.accept")
      : draft.error === "max_file_size"
        ? t("chat.attachmentErrors.maxFileSize")
        : draft.error === "max_files"
          ? t("chat.attachmentErrors.maxFiles")
          : draft.error === "file_read"
            ? t("chat.attachmentErrors.fileRead")
            : null;

  return (
    <form
      className="
        shrink-0 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]
      "
      onSubmit={(event) => void submit(event)}
      // The keyboard overlays the layout viewport instead of shrinking it, so
      // the safe-area padding alone would leave the composer behind it.
      style={
        keyboardInset > 0 ? { paddingBottom: keyboardInset + 8 } : undefined
      }
    >
      {draft.attachments.length > 0 ? (
        <ul
          className="mb-2 flex flex-wrap gap-2"
          aria-label={t("chat.attachments")}
        >
          {draft.attachments.map((attachment) => (
            <li
              className={cn(
                "flex max-w-[10rem] items-center gap-1.5 rounded-full border",
                "border-border-subtle bg-card py-1 pr-1 pl-2 text-xs",
                attachment.status === "error" &&
                  "border-status-danger-border bg-status-danger-soft",
              )}
              key={attachment.id}
            >
              {attachment.status === "reading" ? (
                <Spinner className="size-3.5 shrink-0" />
              ) : null}
              <span className="truncate">{attachment.name}</span>
              {attachment.status === "error" ? (
                <Button
                  aria-label={t("chat.retryAttachment", {
                    name: attachment.name,
                  })}
                  className="size-8 shrink-0 rounded-full"
                  onClick={() => void draft.retry(attachment.id)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <ArrowClockwise size={14} weight="bold" />
                </Button>
              ) : null}
              <Button
                aria-label={t("chat.removeAttachment", {
                  name: attachment.name,
                })}
                className="size-8 shrink-0 rounded-full"
                onClick={() => draft.remove(attachment.id)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X size={14} weight="bold" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {attachmentErrorLabel ? (
        <p className="text-status-danger mb-2 text-xs" role="alert">
          {attachmentErrorLabel}
        </p>
      ) : null}
      {sendError ? (
        <p className="text-status-danger mb-2 text-xs" role="alert">
          {sendError}
        </p>
      ) : null}
      <input
        ref={fileInputRef}
        accept={MOBILE_ATTACHMENT_ACCEPT}
        className="sr-only"
        multiple
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files) void draft.addFiles(files);
          event.currentTarget.value = "";
        }}
        type="file"
      />
      <InputGroup
        className="
          rounded-2xl border-border-subtle bg-card shadow-panel
          dark:bg-card
        "
      >
        <InputGroupTextarea
          aria-label={t("chat.messagePlaceholder")}
          className="max-h-40 min-h-11 text-sm"
          onChange={(event) => {
            setValue(event.target.value);
            if (sendError !== null) setSendError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("chat.messagePlaceholder")}
          value={value}
        />
        <InputGroupAddon align="block-end" className="justify-end gap-2">
          <InputGroupButton
            aria-label={t("chat.attachAria")}
            className="size-11 rounded-full p-0"
            disabled={isStreaming || sendPending}
            onClick={() => fileInputRef.current?.click()}
            type="button"
            variant="ghost"
          >
            <Paperclip size={18} weight="bold" />
          </InputGroupButton>
          {isStreaming ? (
            <InputGroupButton
              aria-label={t("chat.stopAria")}
              className="size-11 rounded-full p-0"
              onClick={conversation.stop}
              variant="secondary"
            >
              <Square size={18} weight="fill" />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              aria-label={t("chat.sendAria")}
              className="
                size-11 rounded-full p-0 transition-transform duration-150
                active:scale-[0.98]
              "
              disabled={!canSend}
              type="submit"
              variant="default"
            >
              {sendPending ? (
                <Spinner className="size-4" />
              ) : (
                <ArrowUp size={18} weight="bold" />
              )}
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
        className="
          inline-flex h-11 items-center rounded-full px-4 text-sm font-medium
          text-primary-strong underline underline-offset-4
        "
        onClick={onRetry}
        type="button"
      >
        {t("common.tryAgain")}
      </button>
    </Empty>
  );
}
