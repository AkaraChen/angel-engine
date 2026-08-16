import type { ChatComposerSubmission } from "@/features/chat/components/composer/chat-composer";
import { useMessageError } from "@assistant-ui/core/react";
import {
  ActionBarPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import {
  WarningCircle as AlertCircleIcon,
  Check,
  Copy,
  GitBranch,
  Pencil,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { ToolGroup } from "@/components/assistant-ui/tool-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CollapsibleMessageBody } from "@/features/chat/components/collapsible-message-body";
import { ChatComposer } from "@/features/chat/components/composer/chat-composer";
import { useComposerEditor } from "@/features/chat/components/composer/use-composer-editor";
import {
  AssistantTextMessagePart,
  FileMessagePart,
  ImageMessagePart,
  MessageAttachment,
  NullMessagePart,
  UserTextMessagePart,
} from "@/features/chat/components/message-content-parts";
import { DataMessagePart } from "@/features/chat/components/message-elicitation";
import { isUserBubblePart } from "@/features/chat/components/message-part-utils";
import {
  iconButtonClass,
  messageActionFooterClass,
  workspaceContentColumnClass,
} from "@/features/chat/components/thread-styles";
import { ToolActionMessagePart } from "@/features/chat/components/tool-action-message";
import { TurnActivity } from "@/features/chat/components/turn-activity";
import { useChatRuntimeActions } from "@/features/chat/runtime/use-chat-runtime-actions";
import { parseShepherdSourceCard } from "@/features/shepherd/parse-shepherd-source-card";
import { ShepherdSourceCard } from "@/features/shepherd/shepherd-source-card";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import { cn } from "@/platform/utils";

/** Icon-only action buttons need a visible label on hover: the sr-only text
    alone leaves sighted users guessing what the lone copy/pencil icon does. */
function ActionTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

const messageColumnClassName = workspaceContentColumnClass;
const userMessageColumnClassName =
  "flex w-full min-w-0 flex-col items-end gap-1.5";
// rounded-xl, not a pill: a pill only reads right on one line, and these
// bubbles routinely run to a paragraph. Capped at 80% so a long user turn still
// sits visibly to the right of the full-width assistant column.
const userMessageBubbleClassName =
  "min-w-0 max-w-[80%] rounded-xl bg-primary-soft px-3.5 py-2.5 text-primary-soft-foreground [font-size:var(--workspace-user-bubble-text-size)] [line-height:var(--workspace-user-bubble-line-height)]";

export function UserMessage() {
  const { t } = useTranslation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const hasBubbleContent = useAuiState((state) =>
    state.message.parts.some(isUserBubblePart),
  );
  const isThreadRunning = useAuiState((state) => state.thread.isRunning);
  const shepherdCard = useAuiState((state) => {
    const text = state.message.parts
      .filter(
        (part): part is Extract<typeof part, { type: "text" }> =>
          part.type === "text",
      )
      .map((part) => part.text)
      .join("");
    return parseShepherdSourceCard(text);
  });

  return (
    <MessagePrimitive.Root
      className={cn(
        messageColumnClassName,
        "group flex",
        shepherdCard ? "justify-start" : "justify-end",
        isThreadRunning &&
          "animate-in duration-200 fade-in-0 slide-in-from-bottom-1",
      )}
      data-workspace-mode={workspaceMode}
    >
      <div
        className={
          shepherdCard
            ? "flex w-full min-w-0 flex-col items-start gap-1.5"
            : userMessageColumnClassName
        }
      >
        <MessagePrimitive.Attachments>
          {({ attachment }) => (
            <MessageAttachment attachment={attachment} key={attachment.id} />
          )}
        </MessagePrimitive.Attachments>
        <UserMessageAttachmentParts />
        {hasBubbleContent ? (
          shepherdCard ? (
            <ShepherdSourceCard parts={shepherdCard} />
          ) : (
            <div className={userMessageBubbleClassName}>
              <CollapsibleMessageBody
                fadeClassName="from-primary-soft"
                toggleClassName="text-primary-soft-foreground"
              >
                <UserMessageParts />
              </CollapsibleMessageBody>
            </div>
          )
        ) : null}
        <div className={messageActionFooterClass}>
          <ActionBarPrimitive.Root
            autohide="not-last"
            autohideFloat="always"
            className="
              flex gap-0.5
              data-floating:opacity-0 data-floating:transition-opacity
              group-hover:data-floating:opacity-100
            "
            hideWhenRunning
          >
            {shepherdCard ? null : (
              <ActionTooltip label={t("common.edit")}>
                <ActionBarPrimitive.Edit className={iconButtonClass}>
                  <Pencil className="size-3.5" />
                  <span className="sr-only">{t("common.edit")}</span>
                </ActionBarPrimitive.Edit>
              </ActionTooltip>
            )}
            <ActionTooltip label={t("common.copy")}>
              <ActionBarPrimitive.Copy
                className={cn(iconButtonClass, "group/copy")}
              >
                <Copy
                  className="
                    size-3.5
                    group-data-copied/copy:hidden
                  "
                />
                <Check
                  className="
                    hidden size-3.5
                    group-data-copied/copy:block
                  "
                />
                <span className="sr-only">{t("common.copy")}</span>
              </ActionBarPrimitive.Copy>
            </ActionTooltip>
            <ForkSessionAction />
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

export function UserEditComposer() {
  const { t } = useTranslation();
  const aui = useAui();
  const initialText = useAuiState((state) => state.composer.text);
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const editor = useComposerEditor({ initialMarkdown: initialText });

  const cancel = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);
  const send = useCallback(
    async ({ text }: ChatComposerSubmission) => {
      const composer = aui.composer();
      composer.setText(text);
      composer.send();
    },
    [aui],
  );

  return (
    <MessagePrimitive.Root
      className={cn(messageColumnClassName, "flex justify-end")}
      data-workspace-mode={workspaceMode}
    >
      <div className="w-full rounded-xl bg-card shadow-xs">
        <ChatComposer
          allowAttachments={false}
          canCancel
          controller={editor}
          inputGroupClassName="
            h-auto! rounded-lg! border! border-border-subtle! bg-transparent!
            p-2.5! shadow-none!
          "
          onCancel={cancel}
          send={send}
          textareaClassName="
            [&_.tiptap]:min-h-24 [&_.tiptap]:rounded-md
            [&_.tiptap]:bg-surface-1 [&_.tiptap]:px-3 [&_.tiptap]:py-2
            [&_.tiptap]:text-sm
          "
        >
          <div className="flex w-full justify-end gap-2 px-2.5 pb-2.5">
            <Button onClick={cancel} size="sm" type="button" variant="ghost">
              {t("common.cancel")}
            </Button>
            <Button disabled={editor.isEmpty} size="sm" type="submit">
              <Check />
              {t("common.save")}
            </Button>
          </div>
        </ChatComposer>
      </div>
    </MessagePrimitive.Root>
  );
}

export function AssistantMessage() {
  const { t } = useTranslation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const isThreadRunning = useAuiState((state) => state.thread.isRunning);

  return (
    <MessagePrimitive.Root
      className={cn(
        messageColumnClassName,
        "group flex justify-start",
        isThreadRunning &&
          "animate-in duration-200 fade-in-0 slide-in-from-bottom-1",
      )}
      data-workspace-mode={workspaceMode}
    >
      <div className="flex w-full flex-col items-start gap-1.5 text-sm/6">
        <div className="w-full">
          <AssistantMessageErrorBanner />
          <AssistantMessageParts />
        </div>
        <div className={messageActionFooterClass}>
          <ActionBarPrimitive.Root
            autohide="not-last"
            autohideFloat="always"
            className="
              flex gap-0.5
              data-floating:opacity-0 data-floating:transition-opacity
              group-hover:data-floating:opacity-100
            "
            hideWhenRunning
          >
            <ActionTooltip label={t("common.copy")}>
              <ActionBarPrimitive.Copy
                className={cn(iconButtonClass, "group/copy")}
              >
                <Copy
                  className="
                    size-3.5
                    group-data-copied/copy:hidden
                  "
                />
                <Check
                  className="
                    hidden size-3.5
                    group-data-copied/copy:block
                  "
                />
                <span className="sr-only">{t("common.copy")}</span>
              </ActionBarPrimitive.Copy>
            </ActionTooltip>
            <ForkSessionAction />
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function ForkSessionAction() {
  const { t } = useTranslation();
  const toast = useToast();
  const { forkSession } = useChatRuntimeActions();
  const messageId = useAuiState((state) => state.message.id);
  const [forking, setForking] = useState(false);

  if (!forkSession) return null;

  const fork = () => {
    if (forking) return;
    setForking(true);
    forkSession(messageId)
      .catch((error) => {
        toast({
          description: getErrorMessage(error),
          title: t("messages.toasts.couldNotForkSession"),
          variant: "destructive",
        });
      })
      .finally(() => {
        setForking(false);
      });
  };

  return (
    <ActionTooltip label={t("messages.forkSession")}>
      <Button
        aria-label={t("messages.forkSession")}
        className={iconButtonClass}
        disabled={forking}
        onClick={fork}
        size="icon"
        type="button"
        variant="ghost"
      >
        <GitBranch className="size-3.5" />
      </Button>
    </ActionTooltip>
  );
}

function AssistantMessageErrorBanner() {
  const { t } = useTranslation();

  return (
    <MessagePrimitive.Error>
      <div
        className="
          mb-3 flex w-full items-start gap-2.5 rounded-lg border
          border-status-danger-border bg-status-danger-soft px-3 py-2.5 text-sm
          text-foreground shadow-xs
        "
        role="alert"
      >
        <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-status-danger" />
        <div className="min-w-0">
          <div className="font-medium">
            {t("notifications.chatActionFailed")}
          </div>
          <AssistantMessageErrorText />
        </div>
      </div>
    </MessagePrimitive.Error>
  );
}

function AssistantMessageErrorText() {
  const { t } = useTranslation();
  const error = useMessageError();
  const text = formatAssistantMessageError(
    error,
    t("notifications.chatActionFailed"),
  );

  if (!text) return null;

  return (
    <div
      className="
      mt-1 text-[13px]/5 whitespace-pre-wrap text-muted-foreground
    "
    >
      {text}
    </div>
  );
}

function formatAssistantMessageError(error: unknown, title: string) {
  const text =
    typeof error === "string" ? error : JSON.stringify(error ?? title);
  const normalizedTitle = title.trim();
  const normalizedText = text.trim();
  return normalizedText.startsWith(normalizedTitle)
    ? normalizedText.slice(normalizedTitle.length).replace(/^[:\s-]+/, "")
    : normalizedText;
}

const userMessagePartComponents = {
  Text: UserTextMessagePart,
  Source: NullMessagePart,
  Image: NullMessagePart,
  File: NullMessagePart,
  data: {
    Fallback: DataMessagePart,
  },
};

const userMessageAttachmentPartComponents = {
  Text: NullMessagePart,
  Source: NullMessagePart,
  Image: ImageMessagePart,
  File: FileMessagePart,
  data: {
    Fallback: NullMessagePart,
  },
};

const assistantMessagePartBaseComponents = {
  Text: AssistantTextMessagePart,
  Source: NullMessagePart,
  Image: ImageMessagePart,
  File: FileMessagePart,
  data: {
    Fallback: DataMessagePart,
  },
};

const standardAssistantMessagePartComponents = {
  ...assistantMessagePartBaseComponents,
  Reasoning,
  ReasoningGroup,
  ToolGroup,
  tools: {
    Fallback: ToolActionMessagePart,
  },
};

const chatAssistantMessagePartComponents = {
  ...assistantMessagePartBaseComponents,
  ChainOfThought: TurnActivity,
};

function UserMessageParts() {
  return <MessagePrimitive.Parts components={userMessagePartComponents} />;
}

function UserMessageAttachmentParts() {
  return (
    <MessagePrimitive.Parts components={userMessageAttachmentPartComponents} />
  );
}

function AssistantMessageParts() {
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  return (
    <MessagePrimitive.Parts
      components={
        workspaceMode === "chat"
          ? chatAssistantMessagePartComponents
          : standardAssistantMessagePartComponents
      }
    />
  );
}
