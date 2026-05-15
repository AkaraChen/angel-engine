import { useState } from "react";
import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAui,
  useAuiState,
  type CompleteAttachment,
  type DataMessagePartProps,
  type EnrichedPartState,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { cjk } from "@streamdown/cjk";
import { code as streamdownCode } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";
import {
  AlertCircleIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleHelp,
  CircleDot,
  Clipboard,
  Copy,
  FileText,
  Hammer,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from "lucide-react";

import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";
import { findPlanModeToggleTarget } from "@/features/chat/runtime/mode-options";
import { Reasoning, ReasoningGroup } from "@/components/assistant-ui/reasoning";
import { ToolGroup } from "@/components/assistant-ui/tool-group";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/components/ui/toast";
import { useChatRuntimeActions } from "@/features/chat/runtime/chat-runtime-actions-context";
import { cn } from "@/platform/utils";
import {
  isChatElicitationData,
  isChatPlanData,
  isChatToolAction,
  parseDataUrl,
  type ChatElicitation,
  type ChatElicitationResponse,
  type ChatPlanData,
  type ChatToolAction,
} from "@/shared/chat";
import {
  iconButtonClass,
  messageActionFooterClass,
  nativeControlRowClass,
  nativePanelClass,
} from "@/features/chat/components/thread-styles";

const assistantTextContainerClassName = [
  "min-w-0 max-w-none text-[15px] leading-[1.72] text-foreground/90 hyphens-auto [line-break:loose] [overflow-wrap:anywhere] [text-rendering:optimizeLegibility] [word-break:normal]",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/35 [&_a:hover]:decoration-primary/70",
  "[&_blockquote]:my-4 [&_blockquote]:border-l-2 [&_blockquote]:border-foreground/10 [&_blockquote]:pl-3.5 [&_blockquote]:text-[14px] [&_blockquote]:leading-[1.72] [&_blockquote]:text-muted-foreground",
  "[&_[data-streamdown=code-block]]:my-4 [&_[data-streamdown=code-block]]:overflow-hidden [&_[data-streamdown=code-block]]:rounded-lg [&_[data-streamdown=code-block]]:border [&_[data-streamdown=code-block]]:border-foreground/[0.08] [&_[data-streamdown=code-block]]:bg-[#f7f7f8] [&_[data-streamdown=code-block]]:p-0 [&_[data-streamdown=code-block]]:shadow-[0_8px_22px_-24px_rgba(0,0,0,0.5)] dark:[&_[data-streamdown=code-block]]:border-white/10 dark:[&_[data-streamdown=code-block]]:bg-white/[0.045] dark:[&_[data-streamdown=code-block]]:shadow-[0_10px_26px_-26px_rgba(0,0,0,0.8)]",
  "[&_[data-streamdown=code-block-actions]]:rounded-full [&_[data-streamdown=code-block-actions]]:border-foreground/10 [&_[data-streamdown=code-block-actions]]:bg-background/80 [&_[data-streamdown=code-block-actions]]:px-1 [&_[data-streamdown=code-block-actions]]:py-0.5 [&_[data-streamdown=code-block-actions]]:shadow-sm [&_[data-streamdown=code-block-actions]]:backdrop-blur-xl dark:[&_[data-streamdown=code-block-actions]]:border-white/10 dark:[&_[data-streamdown=code-block-actions]]:bg-card/75",
  "[&_[data-streamdown=code-block-body]]:rounded-none [&_[data-streamdown=code-block-body]]:border-0 [&_[data-streamdown=code-block-body]]:bg-transparent [&_[data-streamdown=code-block-body]]:p-0 [&_[data-streamdown=code-block-body]]:text-[12.5px] [&_[data-streamdown=code-block-body]]:leading-[1.58]",
  "[&_[data-streamdown=code-block-body]_code>span]:block",
  "[&_[data-streamdown=code-block-header]]:h-8 [&_[data-streamdown=code-block-header]]:border-b [&_[data-streamdown=code-block-header]]:border-foreground/[0.07] [&_[data-streamdown=code-block-header]]:bg-black/[0.018] [&_[data-streamdown=code-block-header]]:px-3 [&_[data-streamdown=code-block-header]]:text-[11px] [&_[data-streamdown=code-block-header]]:font-medium [&_[data-streamdown=code-block-header]]:tracking-normal dark:[&_[data-streamdown=code-block-header]]:border-white/[0.07] dark:[&_[data-streamdown=code-block-header]]:bg-white/[0.035]",
  "[&_[data-streamdown=code-block-header]>span]:ml-0 [&_[data-streamdown=code-block-header]>span]:font-mono [&_[data-streamdown=code-block-header]>span]:text-muted-foreground/75",
  "[&_h1]:mb-3 [&_h1]:mt-1 [&_h1]:text-[21px] [&_h1]:font-semibold [&_h1]:leading-[1.36]",
  "[&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-[17px] [&_h2]:font-semibold [&_h2]:leading-[1.42]",
  "[&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:text-[15px] [&_h3]:font-semibold [&_h3]:leading-[1.5]",
  "[&_hr]:my-5 [&_hr]:border-foreground/10",
  "[&_li]:my-1.5 [&_li]:[line-break:loose] [&_li]:[overflow-wrap:anywhere] [&_li::marker]:text-muted-foreground [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_p]:my-0 [&_p]:[line-break:loose] [&_p]:[overflow-wrap:anywhere] [&_p+p]:mt-3.5",
  "[&_pre]:m-0 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:bg-transparent [&_pre]:px-3.5 [&_pre]:py-3.5 [&_pre]:text-[12.5px] [&_pre]:leading-[1.58] [&_pre]:[line-break:normal] [&_pre]:[overflow-wrap:normal] [&_pre]:[word-break:normal]",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:overflow-hidden [&_table]:rounded-lg",
  "[&_td]:border-b [&_td]:border-foreground/10 [&_td]:px-2.5 [&_td]:py-2 [&_td]:align-top [&_td]:[line-break:loose] [&_td]:[overflow-wrap:anywhere]",
  "[&_th]:border-b [&_th]:border-foreground/10 [&_th]:bg-muted/35 [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium [&_th]:[line-break:loose] [&_th]:[overflow-wrap:anywhere]",
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_[data-streamdown=inline-code]]:rounded-[0.38rem] [&_[data-streamdown=inline-code]]:bg-foreground/[0.055] [&_[data-streamdown=inline-code]]:px-[0.32em] [&_[data-streamdown=inline-code]]:py-[0.12em] [&_[data-streamdown=inline-code]]:font-mono [&_[data-streamdown=inline-code]]:text-[0.88em] [&_[data-streamdown=inline-code]]:text-foreground/90 dark:[&_[data-streamdown=inline-code]]:bg-white/[0.075]",
].join(" ");

const messageColumnClassName = "mx-auto w-full max-w-[860px]";

const inspectorCardClassName = nativePanelClass;
const toolCallCardClassName = nativePanelClass;

type ElicitationQuestion = NonNullable<ChatElicitation["questions"]>[number];

const ALLOW_PERMISSION_RESPONSE: ChatElicitationResponse = { type: "allow" };

type ElicitationFreeformAnswerProps = {
  disabled: boolean;
  onChange: (value: string) => void;
  question: ElicitationQuestion;
  value: string;
};

export function UserMessage() {
  const { t } = useTranslation();
  const hasBubbleContent = useAuiState((state) =>
    state.message.parts.some(isUserBubblePart),
  );

  return (
    <MessagePrimitive.Root
      className={cn(messageColumnClassName, "group flex justify-end")}
    >
      <div className="flex max-w-[74%] flex-col items-end gap-1.5">
        <MessagePrimitive.Attachments>
          {({ attachment }) => (
            <MessageAttachment attachment={attachment} key={attachment.id} />
          )}
        </MessagePrimitive.Attachments>
        <UserMessageAttachmentParts />
        {hasBubbleContent ? (
          <div className="rounded-lg rounded-br-md bg-primary/95 px-3.5 py-2.5 text-[14px] leading-6 text-primary-foreground">
            <UserMessageParts />
          </div>
        ) : null}
        <div className={messageActionFooterClass}>
          <MessageBranchPicker />
          <ActionBarPrimitive.Root
            autohide="not-last"
            autohideFloat="always"
            className="flex gap-0.5 data-[floating]:opacity-0 data-[floating]:transition-opacity group-hover:data-[floating]:opacity-100"
            hideWhenRunning
          >
            <ActionBarPrimitive.Edit className={iconButtonClass}>
              <Pencil className="size-3.5" />
              <span className="sr-only">{t("common.edit")}</span>
            </ActionBarPrimitive.Edit>
            <ActionBarPrimitive.Copy
              className={cn(iconButtonClass, "group/copy")}
            >
              <Copy className="size-3.5 group-data-[copied]/copy:hidden" />
              <Check className="hidden size-3.5 group-data-[copied]/copy:block" />
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

  return (
    <MessagePrimitive.Root
      className={cn(messageColumnClassName, "flex justify-end")}
    >
      <ComposerPrimitive.Root className="w-full max-w-[74%] rounded-lg border border-foreground/[0.08] bg-background/90 p-2.5 shadow-[0_8px_22px_-22px_rgba(0,0,0,0.55)] backdrop-blur-xl dark:border-white/[0.08]">
        <ComposerPrimitive.Input className="min-h-24 w-full resize-none rounded-md bg-muted/30 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/10" />
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

  return (
    <MessagePrimitive.Root
      className={cn(messageColumnClassName, "group flex justify-start")}
    >
      <div className="flex w-full max-w-[760px] flex-col items-start gap-1.5 text-sm leading-6">
        <div className="w-full">
          <AssistantMessageParts />
        </div>
        <div className={messageActionFooterClass}>
          <MessageBranchPicker />
          <ActionBarPrimitive.Root
            autohide="not-last"
            autohideFloat="always"
            className="flex gap-0.5 data-[floating]:opacity-0 data-[floating]:transition-opacity group-hover:data-[floating]:opacity-100"
            hideWhenRunning
          >
            <ActionBarPrimitive.Copy
              className={cn(iconButtonClass, "group/copy")}
            >
              <Copy className="size-3.5 group-data-[copied]/copy:hidden" />
              <Check className="hidden size-3.5 group-data-[copied]/copy:block" />
              <span className="sr-only">{t("common.copy")}</span>
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload className={iconButtonClass}>
              <RefreshCw className="size-3.5" />
              <span className="sr-only">{t("common.reload")}</span>
            </ActionBarPrimitive.Reload>
            <AuiIf condition={(state) => !state.message.speech}>
              <ActionBarPrimitive.Speak className={iconButtonClass}>
                <Volume2 className="size-3.5" />
                <span className="sr-only">{t("common.speak")}</span>
              </ActionBarPrimitive.Speak>
            </AuiIf>
            <AuiIf condition={(state) => Boolean(state.message.speech)}>
              <ActionBarPrimitive.StopSpeaking className={iconButtonClass}>
                <VolumeX className="size-3.5" />
                <span className="sr-only">{t("common.stopSpeaking")}</span>
              </ActionBarPrimitive.StopSpeaking>
            </AuiIf>
            <ActionBarPrimitive.FeedbackPositive
              className={cn(
                iconButtonClass,
                "data-[submitted]:bg-emerald-500/10 data-[submitted]:text-emerald-700",
              )}
            >
              <ThumbsUp className="size-3.5" />
              <span className="sr-only">{t("common.helpful")}</span>
            </ActionBarPrimitive.FeedbackPositive>
            <ActionBarPrimitive.FeedbackNegative
              className={cn(
                iconButtonClass,
                "data-[submitted]:bg-rose-500/10 data-[submitted]:text-rose-700",
              )}
            >
              <ThumbsDown className="size-3.5" />
              <span className="sr-only">{t("common.notHelpful")}</span>
            </ActionBarPrimitive.FeedbackNegative>
            <ActionBarPrimitive.ExportMarkdown
              className={iconButtonClass}
              onExport={(content) => navigator.clipboard.writeText(content)}
            >
              <Clipboard className="size-3.5" />
              <span className="sr-only">{t("messages.exportMarkdown")}</span>
            </ActionBarPrimitive.ExportMarkdown>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

function MessageBranchPicker() {
  return (
    <BranchPickerPrimitive.Root
      className="inline-flex h-7 items-center gap-0.5 rounded-md border border-foreground/[0.08] bg-background/70 px-1 text-xs text-muted-foreground backdrop-blur-xl dark:border-white/[0.08]"
      hideWhenSingleBranch
    >
      <BranchPickerPrimitive.Previous className="inline-flex size-5 items-center justify-center rounded disabled:opacity-40 data-[disabled]:opacity-40 hover:bg-foreground/[0.055] dark:hover:bg-white/[0.07]">
        <ChevronLeft className="size-3" />
      </BranchPickerPrimitive.Previous>
      <span className="min-w-8 text-center tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next className="inline-flex size-5 items-center justify-center rounded disabled:opacity-40 data-[disabled]:opacity-40 hover:bg-foreground/[0.055] dark:hover:bg-white/[0.07]">
        <ChevronRight className="size-3" />
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
}

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
    return <div className="whitespace-pre-wrap">{part.text}</div>;
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
          (messagePart.text || messagePart.status.type === "running")),
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
      shikiTheme={["github-light", "github-dark"]}
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

import { isTextLikeMimeType } from "../../../shared/mime";

function ToolActionMessagePart(part: ToolCallMessagePartProps) {
  const action = isChatToolAction(part.artifact) ? part.artifact : undefined;
  if (action?.kind === "elicitation") {
    return <ElicitationToolPart action={action} part={part} />;
  }

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
  const title = action?.title || action?.inputSummary || part.toolName;
  const outputText = getToolOutputText(action, part.result);
  const errorText = action?.error?.message;
  const isRunning = isRunningToolPhase(phase);
  const isFailed = Boolean(errorText) || phase === "failed";
  const hasDetails = Boolean(part.argsText || outputText || errorText);
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
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="space-y-2 border-t border-foreground/10 px-2.5 py-2.5 dark:border-white/10">
            {part.argsText && (
              <ToolPreBlock
                label={t("messages.tool.input")}
                value={part.argsText}
              />
            )}
            {errorText && (
              <ToolPreBlock
                label={t("common.error")}
                tone="error"
                value={errorText}
              />
            )}
            {!errorText && outputText && (
              <ToolPreBlock
                label={t("messages.tool.output")}
                value={outputText}
              />
            )}
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
  if (outputText || errorText) return false;
  if (action.output?.some((output) => output.text)) return false;
  return title === "hostCapability" || title === "User input requested";
}

function ElicitationToolPart({
  action,
  part,
}: {
  action: ChatToolAction;
  part: ToolCallMessagePartProps;
}) {
  const elicitation = parseElicitation(action.rawInput);
  const phase = action.phase ?? part.status.type;
  const hasOutput = hasToolOutput(action, part.result);

  if (isInlinePermissionElicitation(elicitation)) {
    if (hasOutput) return null;
    return (
      <InlinePermissionApprovalButtons
        action={action}
        elicitation={elicitation}
        part={part}
        phase={phase}
      />
    );
  }

  return (
    <StandaloneElicitationToolPart
      action={action}
      elicitation={elicitation}
      part={part}
    />
  );
}

function StandaloneElicitationToolPart({
  action,
  elicitation,
  part,
}: {
  action: ChatToolAction;
  elicitation?: ChatElicitation;
  part: ToolCallMessagePartProps;
}) {
  const { t } = useTranslation();
  const phase = action.phase ?? part.status.type;
  const title =
    action.title || elicitation?.title || t("messages.elicitation.userInput");
  const outputText = getToolOutputText(action, part.result);
  const questions = elicitation?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fallbackAnswer, setFallbackAnswer] = useState("");
  const { resolveElicitation } = useChatRuntimeActions();
  const hasTextAfterTool = useHasTextAfterToolCall(part.toolCallId);
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const awaitingInput = phase === "awaitingDecision";
  const hasInputQuestions =
    elicitation?.kind === "userInput" || questions.length > 0;
  const open = manualOpen ?? (awaitingInput || !hasTextAfterTool);

  const resume = (response: ChatElicitationResponse) => {
    if (!awaitingInput) return;
    resolveElicitation(
      action.elicitationId ?? elicitation?.id ?? part.toolCallId,
      response,
      part.toolCallId,
    );
  };

  const submitAnswers = () => {
    const responseAnswers =
      questions.length > 0
        ? questions.map((question) => ({
            id: question.id,
            value: answers[question.id] ?? "",
          }))
        : [{ id: "answer", value: fallbackAnswer }];
    resume({ answers: responseAnswers, type: "answers" });
  };

  return (
    <Collapsible
      className={toolCallCardClassName}
      onOpenChange={setManualOpen}
      open={open}
    >
      <ToolActionHeader
        details
        failed={phase === "failed"}
        open={open}
        phase={phase}
        running={awaitingInput}
        title={title}
      />
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="space-y-3 border-t border-foreground/10 px-2.5 py-2.5 dark:border-white/10">
          {elicitation?.body ? (
            <div className="whitespace-pre-wrap text-sm leading-5">
              {elicitation.body}
            </div>
          ) : null}

          {hasInputQuestions ? (
            <div className="space-y-3">
              {questions.length > 0 ? (
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
                    value={answers[question.id] ?? ""}
                  />
                ))
              ) : (
                <textarea
                  className="min-h-20 w-full resize-y rounded-md border border-foreground/[0.08] bg-background/80 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 dark:border-white/[0.08]"
                  disabled={!awaitingInput}
                  onChange={(event) => setFallbackAnswer(event.target.value)}
                  value={fallbackAnswer}
                />
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  disabled={!awaitingInput}
                  onClick={() => resume({ type: "cancel" })}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  disabled={!awaitingInput}
                  onClick={submitAnswers}
                  size="xs"
                  type="button"
                >
                  {t("common.submit")}
                </Button>
              </div>
            </div>
          ) : (
            <PermissionApprovalActions
              allowBypass={!isPlanApprovalToolAction(action)}
              disabled={!awaitingInput}
              onResume={resume}
            />
          )}

          {outputText ? (
            <ToolPreBlock label={t("messages.response")} value={outputText} />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function InlinePermissionApprovalButtons({
  action,
  elicitation,
  part,
  phase,
}: {
  action: ChatToolAction;
  elicitation?: ChatElicitation;
  part: ToolCallMessagePartProps;
  phase: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const { resolveElicitation } = useChatRuntimeActions();
  const awaitingInput = phase === "awaitingDecision";
  const resume = (response: ChatElicitationResponse) => {
    if (!awaitingInput) return;
    setSubmitted(true);
    resolveElicitation(
      action.elicitationId ?? elicitation?.id ?? part.toolCallId,
      response,
      part.toolCallId,
    );
  };

  if (submitted || !awaitingInput) return null;

  return (
    <PermissionApprovalActions
      allowBypass={!isPlanApprovalToolAction(action)}
      className="px-1 pt-1"
      disabled={false}
      onResume={resume}
    />
  );
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
    enablePermissionBypass();
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
        onClick={() => onResume({ type: "allowForSession" })}
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

function isInlinePermissionElicitation(
  elicitation?: ChatElicitation,
): elicitation is ChatElicitation {
  return Boolean(
    isPermissionElicitation(elicitation) &&
    (elicitation.questions?.length ?? 0) === 0,
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

function isPlanApprovalToolAction(action?: ChatToolAction) {
  return action?.kind === "plan";
}

function toolActionFromMessagePart(part: unknown): ChatToolAction | undefined {
  if (!part || typeof part !== "object") return undefined;
  const candidate = part as { artifact?: unknown; type?: string };
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
    if (part?.type === "text" && part.text) return true;
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
  value: string;
}) {
  const { t } = useTranslation();
  const options = question.options ?? [];
  const [selection, setSelection] = useState<
    { label: string; type: "option" } | { type: "other" } | undefined
  >(() =>
    options.some((option) => option.label === value)
      ? { label: value, type: "option" }
      : undefined,
  );
  const selectedOptionLabel =
    selection?.type === "option" ? selection.label : value;
  const selectedOther = selection?.type === "other";
  const showFreeformAnswer = options.length === 0 || selectedOther;

  return (
    <div className="space-y-2">
      <div>
        {question.header ? (
          <div className="text-[11px] font-medium uppercase text-muted-foreground">
            {question.header}
          </div>
        ) : null}
        {question.question ? (
          <div className="text-sm leading-5">{question.question}</div>
        ) : null}
      </div>

      {options.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {options.map((option) => (
            <button
              aria-pressed={selectedOptionLabel === option.label}
              className={cn(
                "w-full rounded-md border border-foreground/[0.08] bg-background/75 px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-foreground/[0.055] active:bg-foreground/[0.075] dark:border-white/[0.08] dark:hover:bg-white/[0.07]",
                selectedOptionLabel === option.label &&
                  "border-primary/35 bg-primary/10 dark:bg-primary/15",
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
              {option.description ? (
                <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </button>
          ))}
          {question.isOther ? (
            <button
              aria-pressed={selectedOther}
              className={cn(
                "w-full rounded-md border border-foreground/[0.08] bg-background/75 px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-foreground/[0.055] active:bg-foreground/[0.075] dark:border-white/[0.08] dark:hover:bg-white/[0.07]",
                selectedOther &&
                  "border-primary/35 bg-primary/10 dark:bg-primary/15",
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
        className="h-8 w-full rounded-md border border-foreground/[0.08] bg-background/80 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 dark:border-white/[0.08]"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        value={value}
      />
    );
  }

  return (
    <textarea
      className="min-h-16 w-full resize-y rounded-md border border-foreground/[0.08] bg-background/80 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 dark:border-white/[0.08]"
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
  const content = (
    <>
      <ToolStatusIcon failed={failed} running={running} />
      <div className="min-w-0 flex-1 truncate font-medium text-foreground/90">
        {title}
      </div>
      <span className="shrink-0 text-[12px] text-muted-foreground/75">
        {phaseLabel}
      </span>
      {details && (
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground/70 transition-transform",
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
    return <AlertCircleIcon className="size-3.5 shrink-0 text-rose-600" />;
  if (running)
    return (
      <Loader2 className="size-3.5 shrink-0 animate-spin text-primary/75" />
    );
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
          "mb-1 text-[11px] font-medium uppercase text-muted-foreground",
          tone === "error" && "text-rose-600",
        )}
      >
        {label}
      </div>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-foreground/[0.065] bg-muted/[0.22] p-2.5 font-mono text-[11px] leading-4 dark:border-white/[0.065] dark:bg-white/[0.035]">
        {value}
      </pre>
    </div>
  );
}

function getToolOutputText(
  action: ChatToolAction | undefined,
  result: unknown,
) {
  if (action?.outputText) return action.outputText;
  if (typeof result === "string") return result;
  if (result === undefined || result === null) return "";
  return JSON.stringify(result, null, 2);
}

function hasToolOutput(action: ChatToolAction | undefined, result: unknown) {
  if (getToolOutputText(action, result)) return true;
  return Boolean(action?.output?.some((output) => output.text));
}

function parseElicitation(
  rawInput?: string | null,
): ChatElicitation | undefined {
  if (!rawInput) return undefined;

  try {
    const parsed: unknown = JSON.parse(rawInput);
    if (isChatElicitationData(parsed)) return parsed;
  } catch {
    return undefined;
  }

  return undefined;
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
  if (
    (part.name === "plan" || part.name === "todo") &&
    isChatPlanData(part.data)
  ) {
    return <PlanMessagePart plan={part.data} />;
  }

  if (part.name === "elicitation" && isChatElicitationData(part.data)) {
    return <ElicitationQuestionCard elicitation={part.data} />;
  }

  return <JsonBlock label={part.name} value={part.data} />;
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
  const hasInputQuestions =
    elicitation.kind === "userInput" || questions.length > 0;
  const isPermissionRequest =
    isPermissionElicitation(elicitation) && !hasInputQuestions;
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
  const title = elicitation.title || t("common.question");
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const open = manualOpen ?? awaitingInput;

  const resume = (response: ChatElicitationResponse) => {
    if (!awaitingInput) return;
    setSubmittedResponseType(response.type);
    resolveElicitation(elicitation.id, response);
  };

  const submitAnswers = () => {
    const responseAnswers =
      questions.length > 0
        ? questions.map((question) => ({
            id: question.id,
            value: answers[question.id] ?? "",
          }))
        : [{ id: "answer", value: fallbackAnswer }];
    resume({ answers: responseAnswers, type: "answers" });
  };

  return (
    <Collapsible
      className={cn(inspectorCardClassName, "my-2")}
      onOpenChange={setManualOpen}
      open={open}
    >
      <CollapsibleTrigger
        className={cn(
          nativeControlRowClass,
          "flex min-h-10 w-full items-center gap-2 rounded-none px-3 py-2 text-left",
        )}
        type="button"
      >
        <CircleHelp className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
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
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="mt-1 space-y-3 border-t border-foreground/10 px-3 py-2.5 dark:border-white/10">
          {elicitation.body ? (
            <div className="whitespace-pre-wrap text-sm leading-5">
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
              {questions.length > 0 ? (
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
                    value={answers[question.id] ?? ""}
                  />
                ))
              ) : (
                <textarea
                  className="min-h-20 w-full resize-y rounded-md border border-foreground/[0.08] bg-background/80 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/10 dark:border-white/[0.08]"
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
          "flex min-h-10 w-full items-center gap-2 rounded-none px-3 py-2 text-left",
        )}
        disabled={!hasDetails}
        type="button"
      >
        <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{planTitle}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground">
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
            {plan.path ? (
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
      {hasDetails ? (
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="space-y-3 border-t border-foreground/10 px-3 py-2.5 dark:border-white/10">
            {plan.text ? (
              <div className="p-2">
                <Streamdown
                  className={assistantTextContainerClassName}
                  controls={false}
                  linkSafety={{ enabled: false }}
                  lineNumbers={false}
                  mode="streaming"
                  plugins={{ cjk, code: streamdownCode, math, mermaid }}
                  shikiTheme={["github-light", "github-dark"]}
                >
                  {plan.text}
                </Streamdown>
              </div>
            ) : null}
            {plan.path ? (
              <div className="flex min-w-0 items-center gap-2 rounded-md border border-foreground/[0.08] bg-background/70 px-2 py-1.5 text-muted-foreground dark:border-white/[0.08]">
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  {plan.path}
                </span>
              </div>
            ) : null}
            {plan.entries.length > 0 ? (
              <ol className="space-y-2">
                {plan.entries.map((entry, index) => (
                  <li
                    className="flex min-w-0 gap-2"
                    key={`${entry.content}-${index}`}
                  >
                    <PlanEntryStatusIcon status={entry.status} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-sm leading-5",
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
              <div className="flex justify-end border-t border-foreground/10 pt-2 dark:border-white/10">
                <Button
                  onClick={startImplementation}
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
    <div className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-foreground/[0.08] bg-muted/[0.18] px-3 py-2 text-xs shadow-[0_8px_22px_-22px_rgba(0,0,0,0.55)] dark:border-white/[0.08]">
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
      return <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />;
    case "in_progress":
      return <CircleDot className="mt-0.5 size-3.5 shrink-0 text-amber-600" />;
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
    <div className="min-w-0 rounded-lg border border-foreground/[0.08] bg-muted/35 p-3 dark:border-white/[0.08]">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-4">
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
    !previewUrl && filePart && !isMention
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
