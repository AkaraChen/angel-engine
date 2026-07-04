import type {
  CompleteAttachment,
  DataMessagePartProps,
  EnrichedPartState,
  ToolCallMessagePartProps,
} from "@assistant-ui/react";
import type {
  ChatElicitation,
  ChatElicitationResponse,
  ChatPlanData,
  ChatToolAction,
  ChatToolActionOutput,
} from "@shared/chat";
import type { TFunction } from "i18next";
import { useMessageError } from "@assistant-ui/core/react";
import {
  ActionBarPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import {
  RiErrorWarningLine as AlertCircleIcon,
  RiCheckLine as Check,
  RiArrowDownSLine as ChevronDown,
  RiCircleLine as Circle,
  RiRadioButtonLine as CircleDot,
  RiQuestionLine as CircleHelp,
  RiFileCopyLine as Copy,
  RiFileTextLine as FileText,
  RiHammerLine as Hammer,
  RiListCheck3 as ListChecks,
  RiLoader4Line as Loader2,
  RiPencilLine as Pencil,
  RiSendPlaneLine as Send,
} from "@remixicon/react";
import {
  isChatElicitationData,
  isChatErrorData,
  isChatPlanData,
  isChatToolAction,
  parseDataUrl,
} from "@shared/chat";
import { isTextLikeMimeType } from "@shared/mime";
import is from "@sindresorhus/is";
import { cjk } from "@streamdown/cjk";
import { code as streamdownCode } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { ToolGroup } from "@/components/assistant-ui/tool-group";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/toast";
import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import {
  iconButtonClass,
  messageActionFooterClass,
  nativeControlRowClass,
  nativePanelClass,
  workspaceContentColumnClass,
} from "@/features/chat/components/thread-styles";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";
import { findPlanModeToggleTarget } from "@/features/chat/runtime/mode-options";
import { useChatRuntimeActions } from "@/features/chat/runtime/use-chat-runtime-actions";

import { cn } from "@/platform/utils";

// Markdown typography lives in the `.chat-markdown` component class in
// index.css so it can use theme tokens and density-aware spacing directly.
const assistantTextContainerClassName = "chat-markdown";

const messageColumnClassName = workspaceContentColumnClass;
const userMessageColumnClassName =
  "flex w-full min-w-0 flex-col items-end gap-1.5";
const userMessageBubbleClassName =
  "min-w-0 max-w-full rounded-lg rounded-br-md bg-primary px-3.5 py-2.5 text-primary-foreground shadow-[0_1px_2px_--theme(--color-primary/25%)] [font-size:var(--workspace-user-bubble-text-size)] [line-height:var(--workspace-user-bubble-line-height)]";

const inspectorCardClassName = nativePanelClass;
const toolCallCardClassName = nativePanelClass;

type ElicitationQuestion = NonNullable<ChatElicitation["questions"]>[number];

const ALLOW_PERMISSION_RESPONSE: ChatElicitationResponse = { type: "allow" };
const ALLOW_SESSION_PERMISSION_RESPONSE: ChatElicitationResponse = {
  type: "allowForSession",
};

interface ElicitationFreeformAnswerProps {
  disabled: boolean;
  onChange: (value: string) => void;
  question: ElicitationQuestion;
  value?: string;
}

export function UserMessage() {
  const { t } = useTranslation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);
  const hasBubbleContent = useAuiState((state) =>
    state.message.parts.some(isUserBubblePart),
  );
  const isThreadRunning = useAuiState((state) => state.thread.isRunning);

  return (
    <MessagePrimitive.Root
      className={cn(
        messageColumnClassName,
        "group flex justify-end",
        isThreadRunning &&
          "animate-in duration-200 fade-in-0 slide-in-from-bottom-1",
      )}
      data-workspace-mode={workspaceMode}
    >
      <div className={userMessageColumnClassName}>
        <MessagePrimitive.Attachments>
          {({ attachment }) => (
            <MessageAttachment attachment={attachment} key={attachment.id} />
          )}
        </MessagePrimitive.Attachments>
        <UserMessageAttachmentParts />
        {hasBubbleContent ? (
          <div className={userMessageBubbleClassName}>
            <UserMessageParts />
          </div>
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
            <ActionBarPrimitive.Edit className={iconButtonClass}>
              <Pencil className="size-3.5" />
              <span className="sr-only">{t("common.edit")}</span>
            </ActionBarPrimitive.Edit>
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
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

export function UserEditComposer() {
  const { t } = useTranslation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  return (
    <MessagePrimitive.Root
      className={cn(messageColumnClassName, "flex justify-end")}
      data-workspace-mode={workspaceMode}
    >
      <ComposerPrimitive.Root
        className="
          w-full rounded-lg border border-border-subtle bg-background/90 p-2.5
          shadow-panel backdrop-blur-xl
        "
      >
        <ComposerPrimitive.Input
          className="
            min-h-24 w-full resize-none rounded-md bg-surface-1 px-3 py-2
            text-sm outline-none
            focus-visible:ring-3 focus-visible:ring-primary/12
          "
        />
        <div className="mt-2 flex justify-end gap-2">
          <ComposerPrimitive.Cancel asChild>
            <Button size="sm" type="button" variant="ghost">
              {t("common.cancel")}
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" type="submit">
              <Check />
              {t("common.save")}
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
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
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
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
    <div className="mt-1 text-[13px]/5 whitespace-pre-wrap text-muted-foreground">
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
  Text: PlainTextMessagePart,
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

const assistantMessagePartComponents = {
  Text: AssistantTextMessagePart,
  Reasoning,
  ReasoningGroup,
  Source: NullMessagePart,
  Image: ImageMessagePart,
  File: FileMessagePart,
  ToolGroup,
  tools: {
    Fallback: ToolActionMessagePart,
  },
  data: {
    Fallback: DataMessagePart,
  },
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
  return <MessagePrimitive.Parts components={assistantMessagePartComponents} />;
}

function PlainTextMessagePart(
  part: Extract<EnrichedPartState, { type: "text" }>,
) {
  const { t } = useTranslation();

  if (part.type === "text") {
    if (part.status.type === "running" && !part.text) {
      return (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          {t("common.thinking")}
        </span>
      );
    }
    return (
      <div
        className="
          [font-size:var(--workspace-user-bubble-text-size)]
          leading-(--workspace-user-bubble-line-height) wrap-anywhere
          [word-break:normal] whitespace-pre-wrap
        "
      >
        {part.text}
      </div>
    );
  }

  return null;
}

function AssistantTextMessagePart(
  part: Extract<EnrichedPartState, { type: "text" }>,
) {
  const { t } = useTranslation();
  const hasReasoningOrTool = useAuiState((state) =>
    state.message.parts.some(
      (messagePart) =>
        messagePart.type === "tool-call" ||
        (messagePart.type === "data" &&
          (messagePart.name === "plan" ||
            messagePart.name === "todo" ||
            messagePart.name === "elicitation")) ||
        (messagePart.type === "reasoning" &&
          (is.nonEmptyString(messagePart.text) ||
            messagePart.status.type === "running")),
    ),
  );

  if (part.type === "text" && part.status.type === "running" && !part.text) {
    return hasReasoningOrTool ? null : (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t("common.thinking")}
      </span>
    );
  }

  return (
    <StreamdownTextPrimitive
      caret="block"
      containerClassName={assistantTextContainerClassName}
      controls={{ code: false }}
      linkSafety={{ enabled: false }}
      lineNumbers={false}
      mode="streaming"
      plugins={{ cjk, code: streamdownCode, math, mermaid }}
      shikiTheme={["vitesse-light", "vitesse-dark"]}
    />
  );
}

function isUserBubblePart(part: {
  status?: { type: string };
  text?: string;
  type: string;
}) {
  switch (part.type) {
    case "file":
    case "image":
    case "source":
      return false;
    case "text":
      return part.status?.type === "running" || Boolean(part.text);
    default:
      return true;
  }
}

function ImageMessagePart(part: Extract<EnrichedPartState, { type: "image" }>) {
  const { t } = useTranslation();

  return (
    <ChatAttachmentTile
      className="my-2 max-w-64"
      name={part.filename ?? "image"}
      previewUrl={part.image}
      typeLabel={t("common.image")}
    />
  );
}

function FileMessagePart(part: Extract<EnrichedPartState, { type: "file" }>) {
  const { t } = useTranslation();
  const isMention = messageFileMention(part);
  const isImage = part.mimeType.startsWith("image/");
  const previewText =
    isMention || isImage
      ? undefined
      : textFilePreview(part.data, part.mimeType);

  return (
    <ChatAttachmentTile
      className="my-2 max-w-64"
      contentType={part.mimeType}
      name={part.filename ?? part.mimeType}
      previewText={previewText}
      previewUrl={filePreviewUrl(part.data, part.mimeType, isMention, isImage)}
      typeLabel={fileTypeLabel(isMention, isImage, t)}
    />
  );
}

function filePreviewUrl(
  data: string,
  mimeType: string,
  isMention: boolean,
  isImage: boolean,
) {
  if (isMention || !isImage) return undefined;
  return imageFilePreviewUrl(data, mimeType);
}

function fileTypeLabel(isMention: boolean, isImage: boolean, t: TFunction) {
  if (isMention) return t("common.mention");
  if (isImage) return t("common.image");
  return t("common.file");
}

function imageFilePreviewUrl(data: string, mimeType: string) {
  return data.startsWith("data:") ? data : `data:${mimeType};base64,${data}`;
}

function textFilePreview(data: string, mimeType: string) {
  if (!isTextLikeMimeType(mimeType)) return undefined;
  const parsed = parseDataUrl(data);
  const encoded = parsed?.data ?? data;
  try {
    const binary = atob(encoded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    return decoded.includes("\uFFFD") ? data : decoded;
  } catch {
    return data;
  }
}

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

function PermissionApprovalActions({
  allowBypass = true,
  className,
  disabled,
  onResume,
}: {
  allowBypass?: boolean;
  className?: string;
  disabled: boolean;
  onResume: (response: ChatElicitationResponse) => void;
}) {
  const { t } = useTranslation();
  const { enablePermissionBypass, permissionBypassEnabled } =
    useChatRuntimeActions();
  const bypassPermission = () => {
    if (disabled) return;
    enablePermissionBypass(ALLOW_PERMISSION_RESPONSE);
    onResume(ALLOW_PERMISSION_RESPONSE);
  };

  return (
    <div className={cn("flex flex-wrap justify-end gap-2", className)}>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "deny" })}
        size="xs"
        type="button"
        variant="ghost"
      >
        {t("common.deny")}
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "cancel" })}
        size="xs"
        type="button"
        variant="ghost"
      >
        {t("common.cancel")}
      </Button>
      <Button
        disabled={disabled}
        onClick={() => {
          enablePermissionBypass(ALLOW_SESSION_PERMISSION_RESPONSE);
          onResume(ALLOW_SESSION_PERMISSION_RESPONSE);
        }}
        size="xs"
        type="button"
        variant="outline"
      >
        {t("common.allowSession")}
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "allow" })}
        size="xs"
        type="button"
      >
        {t("common.allow")}
      </Button>
      {allowBypass ? (
        <Button
          disabled={disabled || permissionBypassEnabled}
          onClick={bypassPermission}
          size="xs"
          type="button"
          variant="destructive"
        >
          {t("common.bypassPermission")}
        </Button>
      ) : null}
    </div>
  );
}

function isPermissionElicitation(
  elicitation?: ChatElicitation,
): elicitation is ChatElicitation {
  return Boolean(
    elicitation &&
    (elicitation.kind === "approval" ||
      elicitation.kind === "permissionProfile"),
  );
}

function toolActionFromMessagePart(part: unknown): ChatToolAction | undefined {
  if (!is.plainObject(part)) {
    return undefined;
  }
  const candidate = part as { artifact?: unknown; type?: unknown };
  if (candidate.type !== "tool-call") return undefined;
  return isChatToolAction(candidate.artifact) ? candidate.artifact : undefined;
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

function ElicitationQuestionInput({
  disabled,
  onChange,
  question,
  value,
}: {
  disabled: boolean;
  onChange: (value: string) => void;
  question: ElicitationQuestion;
  value?: string;
}) {
  const { t } = useTranslation();
  const options = question.options ?? [];
  const [selection, setSelection] = useState<
    { label: string; type: "option" } | { type: "other" } | undefined
  >(() =>
    value !== undefined && options.some((option) => option.label === value)
      ? { label: value, type: "option" }
      : undefined,
  );
  const selectedOptionLabel =
    selection?.type === "option" ? selection.label : value;
  const selectedOther = selection?.type === "other";
  const hasOptions = options.length > 0;
  const showFreeformAnswer = !hasOptions || selectedOther;

  return (
    <div className="space-y-2">
      <div>
        {is.nonEmptyString(question.header) ? (
          <div
            className={cn(
              "text-[11px] font-medium text-muted-foreground uppercase",
            )}
          >
            {question.header}
          </div>
        ) : null}
        {is.nonEmptyString(question.question) ? (
          <div className="text-sm/5">{question.question}</div>
        ) : null}
      </div>

      {hasOptions ? (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <button
              aria-pressed={selectedOptionLabel === option.label}
              className={cn(
                `
                  w-full rounded-md border border-border-subtle bg-background/75
                  px-3 py-2 text-left text-sm/5 transition-colors
                  hover:bg-overlay-hover
                  active:bg-overlay-active
                `,
                selectedOptionLabel === option.label &&
                  `border-primary/35 bg-primary-soft`,
              )}
              disabled={disabled}
              key={option.label}
              onClick={() => {
                setSelection({ label: option.label, type: "option" });
                onChange(option.label);
              }}
              type="button"
            >
              <span>{option.label}</span>
              {is.nonEmptyString(option.description) ? (
                <span className="mt-0.5 block text-xs/4 text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </button>
          ))}
          {question.isOther ? (
            <button
              aria-pressed={selectedOther}
              className={cn(
                `
                  w-full rounded-md border border-border-subtle bg-background/75
                  px-3 py-2 text-left text-sm/5 transition-colors
                  hover:bg-overlay-hover
                  active:bg-overlay-active
                `,
                selectedOther && `border-primary/35 bg-primary-soft`,
              )}
              disabled={disabled}
              onClick={() => {
                setSelection({ type: "other" });
                onChange("");
              }}
              type="button"
            >
              {t("common.other")}
            </button>
          ) : null}
        </div>
      ) : null}

      {showFreeformAnswer ? (
        <ElicitationFreeformAnswer
          disabled={disabled}
          onChange={onChange}
          question={question}
          value={value}
        />
      ) : null}
    </div>
  );
}

function ElicitationFreeformAnswer({
  disabled,
  onChange,
  question,
  value,
}: ElicitationFreeformAnswerProps) {
  if (question.isSecret) {
    return (
      <input
        className="
          h-8 w-full rounded-md border border-border-subtle bg-background/80
          px-3 text-sm outline-none
          focus-visible:border-primary/40 focus-visible:ring-3
          focus-visible:ring-primary/12
        "
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        value={value}
      />
    );
  }

  return (
    <textarea
      className="
        min-h-16 w-full resize-y rounded-md border border-border-subtle
        bg-background/80 px-3 py-2 text-sm outline-none
        focus-visible:border-primary/40 focus-visible:ring-3
        focus-visible:ring-primary/12
      "
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
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
          max-h-48 overflow-auto rounded-md border border-border-subtle
          bg-surface-1/70 p-2.5 font-mono text-[11px]/4 wrap-break-word
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

function formatElicitationKind(kind: string, t: TFunction) {
  switch (kind) {
    case "userInput":
      return t("messages.elicitation.userInput");
    case "externalFlow":
      return t("messages.elicitation.externalFlow");
    case "dynamicToolCall":
      return t("messages.elicitation.dynamicTool");
    case "permissionProfile":
      return t("messages.elicitation.permissionProfile");
    default:
      return kind || t("common.question");
  }
}

function formatElicitationPhase(phase: string, t: TFunction) {
  if (phase.startsWith("resolved:")) return t("common.answered");
  switch (phase) {
    case "open":
      return t("messages.elicitation.awaitingAnswer");
    case "resolving":
      return t("common.submitting");
    case "cancelled":
      return t("common.cancelled");
    default:
      return phase || t("common.pending");
  }
}

function DataMessagePart(part: DataMessagePartProps) {
  if (part.name === "chat-error" && isChatErrorData(part.data)) {
    return null;
  }

  if (
    (part.name === "plan" || part.name === "todo") &&
    isChatPlanData(part.data)
  ) {
    return <PlanMessagePart plan={part.data} />;
  }

  if (part.name === "elicitation" && isChatElicitationData(part.data)) {
    return <ElicitationQuestionCard elicitation={part.data} />;
  }

  return <JsonBlock label={part.name} value={part.data as unknown} />;
}

function ElicitationQuestionCard({
  elicitation,
}: {
  elicitation: ChatElicitation;
}) {
  const { t } = useTranslation();
  const { resolveElicitation } = useChatRuntimeActions();
  const questions = elicitation.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fallbackAnswer, setFallbackAnswer] = useState("");
  const [submittedResponseType, setSubmittedResponseType] =
    useState<ChatElicitationResponse["type"]>();
  const awaitingInput = elicitation.phase === "open" && !submittedResponseType;
  const hasQuestions = questions.length > 0;
  const hasInputQuestions = elicitation.kind === "userInput" || hasQuestions;
  const isPermissionRequest =
    isPermissionElicitation(elicitation) && !hasInputQuestions;

  const elicitationCardClassName = cn(
    inspectorCardClassName,
    "my-2",
    isPermissionRequest && "shadow-none",
    awaitingInput && "border-primary/30 ring-1 ring-primary/10",
  );
  const elicitationControlRowClass = isPermissionRequest
    ? "min-w-0 rounded-md transition-colors"
    : nativeControlRowClass;

  const backingActionKind = useAuiState((state) => {
    const actionId = elicitation.actionId ?? elicitation.id;
    return state.message.parts
      .map(toolActionFromMessagePart)
      .find((action) => action?.id === actionId)?.kind;
  });
  const allowBypass = backingActionKind !== "plan";
  const phase = submittedResponseType
    ? submittedResponseType === "cancel"
      ? "cancelled"
      : "resolved:Answers"
    : elicitation.phase;
  const title = is.nonEmptyString(elicitation.title)
    ? elicitation.title
    : t("common.question");
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open = manualOpen ?? awaitingInput;

  const resume = (response: ChatElicitationResponse) => {
    if (!awaitingInput) return;
    setSubmittedResponseType(response.type);
    resolveElicitation(elicitation.id, response);
  };

  const submitAnswers = () => {
    const responseAnswers = hasQuestions
      ? questions.map((question) => {
          const value = answers[question.id];
          if (value === undefined) {
            throw new Error(`Missing answer for question ${question.id}.`);
          }
          return {
            id: question.id,
            value,
          };
        })
      : [{ id: "answer", value: fallbackAnswer }];
    resume({ answers: responseAnswers, type: "answers" });
  };

  return (
    <Collapsible
      className={elicitationCardClassName}
      onOpenChange={setManualOpen}
      open={open}
    >
      <CollapsibleTrigger
        className={cn(
          elicitationControlRowClass,
          `
            flex min-h-10 w-full items-center gap-2 rounded-none px-3 py-2
            text-left
          `,
        )}
        type="button"
      >
        <CircleHelp
          className={cn(
            "size-3.5 shrink-0",
            awaitingInput ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1.5 text-muted-foreground",
            )}
          >
            <span>{formatElicitationKind(elicitation.kind, t)}</span>
            <span aria-hidden>·</span>
            <span>{formatElicitationPhase(phase, t)}</span>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
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
        <div className="mt-1 space-y-3 border-t border-border px-3 py-2.5">
          {is.nonEmptyString(elicitation.body) ? (
            <div className="text-sm/5 whitespace-pre-wrap">
              {elicitation.body}
            </div>
          ) : null}

          {isPermissionRequest ? (
            <PermissionApprovalActions
              allowBypass={allowBypass}
              disabled={!awaitingInput}
              onResume={resume}
            />
          ) : (
            <div className="space-y-3">
              {hasQuestions ? (
                questions.map((question) => (
                  <ElicitationQuestionInput
                    disabled={!awaitingInput}
                    key={question.id}
                    onChange={(value) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: value,
                      }))
                    }
                    question={question}
                    value={answers[question.id]}
                  />
                ))
              ) : (
                <textarea
                  className="
                    min-h-20 w-full resize-y rounded-md border
                    border-border-subtle bg-background/80 px-3 py-2 text-sm
                    outline-none
                    focus-visible:border-primary/40 focus-visible:ring-3
                    focus-visible:ring-primary/12
                  "
                  disabled={!awaitingInput}
                  onChange={(event) => setFallbackAnswer(event.target.value)}
                  value={fallbackAnswer}
                />
              )}

              {awaitingInput ? (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    onClick={() => resume({ type: "cancel" })}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={submitAnswers} size="xs" type="button">
                    <Send className="size-3.5" />
                    {t("common.submit")}
                  </Button>
                </div>
              ) : (
                <div className="text-right text-[11px] text-muted-foreground">
                  {formatElicitationPhase(phase, t)}
                </div>
              )}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PlanMessagePart({ plan }: { plan: ChatPlanData }) {
  const { t } = useTranslation();
  const aui = useAui();
  const chatOptions = useChatOptions();
  const { setMode, setPermissionMode } = useChatRuntimeActions();
  const toast = useToast();
  const isLastMessage = useAuiState((state) => state.message.isLast);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [open, setOpen] = useState(true);
  const [startingImplementation, setStartingImplementation] = useState(false);
  const completed = plan.entries.filter(
    (entry) => entry.status === "completed",
  ).length;
  const isTodoPlan = plan.kind === "todo";
  const planTitle = isTodoPlan ? t("common.todo") : t("common.plan");
  const hasDetails = plan.entries.length > 0 || Boolean(plan.text);
  const target = findPlanModeToggleTarget([
    {
      canSet: chatOptions.canSetMode,
      family: "agent",
      options: chatOptions.modeOptions,
      value: chatOptions.mode,
    },
    {
      canSet: chatOptions.canSetPermissionMode,
      family: "permission",
      options: chatOptions.permissionModeOptions,
      value: chatOptions.permissionMode,
    },
  ]);
  const canStartImplementation =
    plan.kind === "review" &&
    !isRunning &&
    !startingImplementation &&
    !chatOptions.configLoading &&
    Boolean(target?.buildMode);

  if (plan.presentation === "created" || plan.presentation === "updated") {
    return (
      <PlanMarkerPart
        kind={plan.kind ?? "review"}
        presentation={plan.presentation}
      />
    );
  }

  const startImplementation = async () => {
    if (!target?.buildMode || startingImplementation) return;
    setStartingImplementation(true);
    try {
      if (target.family === "agent") {
        await setMode(target.buildMode.value);
      } else {
        await setPermissionMode(target.buildMode.value);
      }
      aui.thread().append({
        content: [{ text: "start implementation", type: "text" }],
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("messages.toasts.couldNotStartImplementation"),
        variant: "destructive",
      });
    } finally {
      setStartingImplementation(false);
    }
  };

  return (
    <Collapsible
      className={inspectorCardClassName}
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger
        className={cn(
          nativeControlRowClass,
          `
            flex min-h-10 w-full items-center gap-2 rounded-none px-3 py-2
            text-left
          `,
        )}
        disabled={!hasDetails}
        type="button"
      >
        <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{planTitle}</div>
          <div
            className="
              mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground
            "
          >
            {plan.entries.length > 0 ? (
              <span>
                {t("messages.completedCount", {
                  completed,
                  total: plan.entries.length,
                })}
              </span>
            ) : (
              <span>{t("common.draft")}</span>
            )}
            {is.nonEmptyString(plan.path) ? (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{plan.path}</span>
              </>
            ) : null}
          </div>
        </div>
        {hasDetails ? (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
        ) : null}
      </CollapsibleTrigger>
      {plan.entries.length > 0 ? (
        <div
          aria-hidden="true"
          className="
            mx-3 mb-1.5 h-0.5 overflow-hidden rounded-full bg-surface-2
          "
        >
          <div
            className="
              h-full rounded-full bg-primary transition-[width] duration-500
              ease-swift
            "
            style={{
              width: `${Math.round((completed / plan.entries.length) * 100)}%`,
            }}
          />
        </div>
      ) : null}
      {hasDetails ? (
        <CollapsibleContent
          className="
            overflow-hidden
            data-[state=closed]:animate-collapsible-up
            data-[state=open]:animate-collapsible-down
          "
        >
          <div className="space-y-3 border-t border-border px-3 py-2.5">
            {is.nonEmptyString(plan.text) ? (
              <div className="p-2">
                <Streamdown
                  className={assistantTextContainerClassName}
                  controls={false}
                  linkSafety={{ enabled: false }}
                  lineNumbers={false}
                  mode="streaming"
                  plugins={{ cjk, code: streamdownCode, math, mermaid }}
                  shikiTheme={["vitesse-light", "vitesse-dark"]}
                >
                  {plan.text}
                </Streamdown>
              </div>
            ) : null}
            {is.nonEmptyString(plan.path) ? (
              <div
                className="
                  flex min-w-0 items-center gap-2 rounded-md border
                  border-border-subtle bg-background/70 px-2 py-1.5
                  text-muted-foreground
                "
              >
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  {plan.path}
                </span>
              </div>
            ) : null}
            {plan.entries.length > 0 ? (
              <ol className="space-y-2">
                {plan.entries.map((entry) => (
                  <li
                    className="flex min-w-0 gap-2"
                    key={`${entry.status}:${entry.content}`}
                  >
                    <PlanEntryStatusIcon status={entry.status} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm/5",
                        entry.status === "completed" &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {entry.content}
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
            {isLastMessage && canStartImplementation ? (
              <div className="flex justify-end border-t border-border pt-2">
                <Button
                  onClick={() => {
                    void startImplementation();
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {startingImplementation ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Hammer className="size-3.5" />
                  )}
                  {t("messages.startImplementation")}
                </Button>
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

function PlanMarkerPart({
  kind,
  presentation,
}: {
  kind: "review" | "todo";
  presentation: "created" | "updated";
}) {
  const { t } = useTranslation();
  const title = kind === "todo" ? t("common.todo") : t("common.plan");
  const presentationLabel =
    presentation === "created" ? t("messages.created") : t("common.updated");

  return (
    <div
      className="
        flex min-h-10 w-full items-center gap-2 rounded-lg border
        border-border-subtle bg-surface-1/50 px-3 py-2 text-xs shadow-panel
      "
    >
      <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="truncate font-medium">
        {t("messages.planMarker", {
          presentation: presentationLabel,
          title,
        })}
      </div>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function PlanEntryStatusIcon({
  status,
}: {
  status: ChatPlanData["entries"][number]["status"];
}) {
  switch (status) {
    case "completed":
      return <Check className="mt-0.5 size-3.5 shrink-0 text-status-success" />;
    case "in_progress":
      return (
        <CircleDot
          className="
        mt-0.5 size-3.5 shrink-0 text-status-attention
      "
        />
      );
    case "pending":
      return (
        <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
    default:
      return (
        <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      );
  }
}

function NullMessagePart(): null {
  return null;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div
      className="
        min-w-0 rounded-lg border border-border-subtle bg-surface-1 p-3
      "
    >
      <div
        className="
          mb-1 text-[11px] font-medium tracking-wide text-muted-foreground
          uppercase
        "
      >
        {label}
      </div>
      <pre
        className="
          max-h-40 overflow-auto font-mono text-[11px]/4 wrap-break-word
          whitespace-pre-wrap
        "
      >
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function MessageAttachment({ attachment }: { attachment: CompleteAttachment }) {
  const { t } = useTranslation();
  const imagePart = attachment.content.find((part) => part.type === "image");
  const filePart = attachment.content.find((part) => part.type === "file");
  const isMention = filePart ? messageFileMention(filePart) : false;
  const previewUrl = isMention
    ? undefined
    : (imagePart?.image ??
      (filePart?.mimeType.startsWith("image/")
        ? imageFilePreviewUrl(filePart.data, filePart.mimeType)
        : undefined));
  const previewText =
    !is.nonEmptyString(previewUrl) && filePart !== undefined && !isMention
      ? textFilePreview(filePart.data, filePart.mimeType)
      : undefined;

  return (
    <ChatAttachmentTile
      className="max-w-64"
      contentType={attachment.contentType ?? filePart?.mimeType}
      name={attachment.name}
      previewText={previewText}
      previewUrl={previewUrl}
      typeLabel={
        isMention
          ? t("common.mention")
          : attachment.type === "image"
            ? t("common.image")
            : attachment.type === "file"
              ? t("common.file")
              : attachment.type
      }
    />
  );
}

function messageFileMention(part: unknown) {
  return (part as { mention?: unknown }).mention === true;
}
