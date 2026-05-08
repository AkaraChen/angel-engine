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
import { findBuildModeOption } from "@/features/chat/runtime/mode-options";
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
} from "@/features/chat/components/thread-styles";

const assistantTextContainerClassName = [
  "min-w-0 max-w-none text-sm leading-6",
  "[&_a]:underline",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_h1]:mb-3 [&_h1]:mt-1 [&_h1]:text-xl [&_h1]:font-semibold",
  "[&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold",
  "[&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold",
  "[&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_p]:my-0 [&_p+p]:mt-3",
  "[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse",
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
  "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_[data-streamdown=inline-code]]:rounded-sm [&_[data-streamdown=inline-code]]:bg-muted [&_[data-streamdown=inline-code]]:px-1 [&_[data-streamdown=inline-code]]:py-0.5 [&_[data-streamdown=inline-code]]:font-mono [&_[data-streamdown=inline-code]]:text-[0.86em]",
].join(" ");

type ElicitationQuestion = NonNullable<ChatElicitation["questions"]>[number];

type ElicitationFreeformAnswerProps = {
  disabled: boolean;
  onChange: (value: string) => void;
  question: ElicitationQuestion;
  value: string;
};

export function UserMessage() {
  const hasBubbleContent = useAuiState((state) =>
    state.message.parts.some(isUserBubblePart),
  );

  return (
    <MessagePrimitive.Root className="group flex justify-end">
      <div className="flex max-w-[78%] flex-col items-end gap-1.5">
        <MessagePrimitive.Attachments>
          {({ attachment }) => (
            <MessageAttachment attachment={attachment} key={attachment.id} />
          )}
        </MessagePrimitive.Attachments>
        <UserMessageAttachmentParts />
        {hasBubbleContent ? (
          <div className="rounded-md bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground">
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
              <span className="sr-only">Edit</span>
            </ActionBarPrimitive.Edit>
            <ActionBarPrimitive.Copy
              className={cn(iconButtonClass, "group/copy")}
            >
              <Copy className="size-3.5 group-data-[copied]/copy:hidden" />
              <Check className="hidden size-3.5 group-data-[copied]/copy:block" />
              <span className="sr-only">Copy</span>
            </ActionBarPrimitive.Copy>
          </ActionBarPrimitive.Root>
        </div>
      </div>
    </MessagePrimitive.Root>
  );
}

export function UserEditComposer() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <ComposerPrimitive.Root className="w-full max-w-[78%] rounded-md border bg-background p-2 shadow-sm">
        <ComposerPrimitive.Input className="min-h-24 w-full resize-none rounded-sm bg-muted/30 px-3 py-2 text-sm outline-none" />
        <div className="mt-2 flex justify-end gap-2">
          <ComposerPrimitive.Cancel asChild>
            <Button size="sm" type="button" variant="ghost">
              Cancel
            </Button>
          </ComposerPrimitive.Cancel>
          <ComposerPrimitive.Send asChild>
            <Button size="sm" type="submit">
              <Check />
              Save
            </Button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>
    </MessagePrimitive.Root>
  );
}

export function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex justify-start">
      <div className="flex w-full max-w-[82%] flex-col items-start gap-1.5 text-sm leading-6">
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
              <span className="sr-only">Copy</span>
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload className={iconButtonClass}>
              <RefreshCw className="size-3.5" />
              <span className="sr-only">Reload</span>
            </ActionBarPrimitive.Reload>
            <AuiIf condition={(state) => !state.message.speech}>
              <ActionBarPrimitive.Speak className={iconButtonClass}>
                <Volume2 className="size-3.5" />
                <span className="sr-only">Speak</span>
              </ActionBarPrimitive.Speak>
            </AuiIf>
            <AuiIf condition={(state) => Boolean(state.message.speech)}>
              <ActionBarPrimitive.StopSpeaking className={iconButtonClass}>
                <VolumeX className="size-3.5" />
                <span className="sr-only">Stop speaking</span>
              </ActionBarPrimitive.StopSpeaking>
            </AuiIf>
            <ActionBarPrimitive.FeedbackPositive
              className={cn(
                iconButtonClass,
                "data-[submitted]:bg-emerald-500/10 data-[submitted]:text-emerald-700",
              )}
            >
              <ThumbsUp className="size-3.5" />
              <span className="sr-only">Helpful</span>
            </ActionBarPrimitive.FeedbackPositive>
            <ActionBarPrimitive.FeedbackNegative
              className={cn(
                iconButtonClass,
                "data-[submitted]:bg-rose-500/10 data-[submitted]:text-rose-700",
              )}
            >
              <ThumbsDown className="size-3.5" />
              <span className="sr-only">Not helpful</span>
            </ActionBarPrimitive.FeedbackNegative>
            <ActionBarPrimitive.ExportMarkdown
              className={iconButtonClass}
              onExport={(content) => navigator.clipboard.writeText(content)}
            >
              <Clipboard className="size-3.5" />
              <span className="sr-only">Export Markdown</span>
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
      className="inline-flex h-7 items-center gap-0.5 rounded-md border bg-background px-1 text-xs text-muted-foreground"
      hideWhenSingleBranch
    >
      <BranchPickerPrimitive.Previous className="inline-flex size-5 items-center justify-center rounded-sm hover:bg-muted disabled:opacity-40">
        <ChevronLeft className="size-3" />
      </BranchPickerPrimitive.Previous>
      <span className="min-w-8 text-center tabular-nums">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next className="inline-flex size-5 items-center justify-center rounded-sm hover:bg-muted disabled:opacity-40">
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
  if (part.type === "text") {
    if (part.status.type === "running" && !part.text) {
      return (
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Thinking
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
  const hasReasoningOrTool = useAuiState((state) =>
    state.message.parts.some(
      (messagePart) =>
        messagePart.type === "tool-call" ||
        (messagePart.type === "data" &&
          (messagePart.name === "plan" ||
            messagePart.name === "elicitation")) ||
        (messagePart.type === "reasoning" &&
          (messagePart.text.trim() || messagePart.status.type === "running")),
    ),
  );

  if (part.type === "text" && part.status.type === "running" && !part.text) {
    return hasReasoningOrTool ? null : (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Thinking
      </span>
    );
  }

  return (
    <StreamdownTextPrimitive
      caret="block"
      containerClassName={assistantTextContainerClassName}
      controls
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
      return part.status?.type === "running" || Boolean(part.text?.trim());
    default:
      return true;
  }
}

function ImageMessagePart(part: Extract<EnrichedPartState, { type: "image" }>) {
  return (
    <ChatAttachmentTile
      className="my-2 max-w-64"
      name={part.filename ?? "image"}
      previewUrl={part.image}
      typeLabel="Image"
    />
  );
}

function FileMessagePart(part: Extract<EnrichedPartState, { type: "file" }>) {
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
      typeLabel={fileTypeLabel(isMention, isImage)}
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

function fileTypeLabel(isMention: boolean, isImage: boolean) {
  if (isMention) return "Mention";
  if (isImage) return "Image";
  return "File";
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

function isTextLikeMimeType(mimeType: string) {
  const normalized = mimeType.toLowerCase();
  return (
    normalized.startsWith("text/") ||
    normalized === "application/json" ||
    normalized === "application/xml" ||
    normalized === "application/javascript" ||
    normalized === "application/typescript" ||
    normalized === "application/x-ndjson" ||
    normalized === "application/yaml" ||
    normalized === "application/toml" ||
    normalized.endsWith("+json") ||
    normalized.endsWith("+xml")
  );
}

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
      className="w-full overflow-hidden rounded-md border bg-muted/20 text-xs"
      onOpenChange={setManualOpen}
      open={open}
    >
      <ToolActionHeader
        details={hasDetails}
        failed={isFailed}
        kind={action?.kind || part.toolName}
        open={open}
        phase={phase}
        running={isRunning}
        title={title}
      />
      {hasDetails && (
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="space-y-2 border-t px-3 py-2">
            {part.argsText && (
              <ToolPreBlock label="Input" value={part.argsText} />
            )}
            {errorText && (
              <ToolPreBlock label="Error" tone="error" value={errorText} />
            )}
            {!errorText && outputText && (
              <ToolPreBlock label="Output" value={outputText} />
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
  if (outputText.trim() || errorText?.trim()) return false;
  if (action.output?.some((output) => output.text.trim())) return false;
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
    return <InlinePermissionApprovalButtons part={part} phase={phase} />;
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
  const phase = action.phase ?? part.status.type;
  const title = action.title || elicitation?.title || "User input";
  const outputText = getToolOutputText(action, part.result);
  const questions = elicitation?.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fallbackAnswer, setFallbackAnswer] = useState("");
  const hasTextAfterTool = useHasTextAfterToolCall(part.toolCallId);
  const [manualOpen, setManualOpen] = useState<boolean | undefined>();
  const awaitingInput = phase === "awaitingDecision";
  const hasInputQuestions =
    elicitation?.kind === "userInput" || questions.length > 0;
  const open = manualOpen ?? (awaitingInput || !hasTextAfterTool);

  const resume = (response: ChatElicitationResponse) => {
    if (!awaitingInput) return;
    part.resume(response);
  };

  const submitAnswers = () => {
    const responseAnswers =
      questions.length > 0
        ? questions.map((question) => ({
            id: question.id,
            value: (answers[question.id] ?? "").trim(),
          }))
        : [{ id: "answer", value: fallbackAnswer.trim() }];
    resume({ answers: responseAnswers, type: "answers" });
  };

  return (
    <Collapsible
      className="w-full overflow-hidden rounded-md border bg-muted/20 text-xs"
      onOpenChange={setManualOpen}
      open={open}
    >
      <ToolActionHeader
        details
        failed={phase === "failed"}
        kind={elicitation?.kind || "elicitation"}
        open={open}
        phase={phase}
        running={awaitingInput}
        title={title}
      />
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="space-y-3 border-t px-3 py-2">
          {elicitation?.body?.trim() ? (
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
                  className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
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
                  Cancel
                </Button>
                <Button
                  disabled={!awaitingInput}
                  onClick={submitAnswers}
                  size="xs"
                  type="button"
                >
                  Submit
                </Button>
              </div>
            </div>
          ) : (
            <PermissionApprovalActions
              disabled={!awaitingInput}
              onResume={resume}
            />
          )}

          {outputText ? (
            <ToolPreBlock label="Response" value={outputText} />
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function InlinePermissionApprovalButtons({
  part,
  phase,
}: {
  part: ToolCallMessagePartProps;
  phase: string;
}) {
  const [submitted, setSubmitted] = useState(false);
  const awaitingInput = phase === "awaitingDecision";
  const resume = (response: ChatElicitationResponse) => {
    if (!awaitingInput) return;
    setSubmitted(true);
    part.resume(response);
  };

  if (submitted || !awaitingInput) return null;

  return (
    <PermissionApprovalActions
      className="px-1 pt-1"
      disabled={false}
      onResume={resume}
    />
  );
}

function PermissionApprovalActions({
  className,
  disabled,
  onResume,
}: {
  className?: string;
  disabled: boolean;
  onResume: (response: ChatElicitationResponse) => void;
}) {
  return (
    <div className={cn("flex flex-wrap justify-end gap-2", className)}>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "deny" })}
        size="xs"
        type="button"
        variant="ghost"
      >
        Deny
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "cancel" })}
        size="xs"
        type="button"
        variant="ghost"
      >
        Cancel
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "allowForSession" })}
        size="xs"
        type="button"
        variant="outline"
      >
        Allow session
      </Button>
      <Button
        disabled={disabled}
        onClick={() => onResume({ type: "allow" })}
        size="xs"
        type="button"
      >
        Allow
      </Button>
    </div>
  );
}

function isInlinePermissionElicitation(
  elicitation?: ChatElicitation,
): elicitation is ChatElicitation {
  return Boolean(
    elicitation &&
    (elicitation.kind === "approval" ||
      elicitation.kind === "permissionProfile") &&
    (elicitation.questions?.length ?? 0) === 0,
  );
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
    if (part?.type === "text" && part.text?.trim()) return true;
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
                "w-full rounded-sm border bg-background px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-muted/40",
                selectedOptionLabel === option.label &&
                  "border-primary bg-primary/10",
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
                "w-full rounded-sm border bg-background px-3 py-2 text-left text-sm leading-5 transition-colors hover:bg-muted/40",
                selectedOther && "border-primary bg-primary/10",
              )}
              disabled={disabled}
              onClick={() => {
                setSelection({ type: "other" });
                onChange("");
              }}
              type="button"
            >
              Other
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
        className="h-8 w-full rounded-sm border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        type="password"
        value={value}
      />
    );
  }

  return (
    <textarea
      className="min-h-16 w-full resize-y rounded-sm border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      value={value}
    />
  );
}

function ToolActionHeader({
  details,
  failed,
  kind,
  open,
  phase,
  running,
  title,
}: {
  details: boolean;
  failed: boolean;
  kind: string;
  open: boolean;
  phase: string;
  running: boolean;
  title: string;
}) {
  const content = (
    <>
      <ToolStatusIcon failed={failed} running={running} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
          <span>{kind}</span>
          <span aria-hidden>·</span>
          <span>{formatToolPhase(phase)}</span>
        </div>
      </div>
      {details && (
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            !open && "-rotate-90",
          )}
        />
      )}
    </>
  );

  const className = cn(
    "flex min-h-9 w-full items-center gap-2 px-3 py-2 text-left",
    details && "hover:bg-muted/40",
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
  if (running) return <Loader2 className="size-3.5 shrink-0 animate-spin" />;
  return <Check className="size-3.5 shrink-0 text-emerald-600" />;
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
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-background/70 p-2 font-mono text-[11px] leading-4">
        {value}
      </pre>
    </div>
  );
}

function getToolOutputText(
  action: ChatToolAction | undefined,
  result: unknown,
) {
  if (action?.outputText?.trim()) return action.outputText;
  if (typeof result === "string") return result;
  if (result === undefined || result === null) return "";
  return JSON.stringify(result, null, 2);
}

function hasToolOutput(action: ChatToolAction | undefined, result: unknown) {
  if (getToolOutputText(action, result).trim()) return true;
  return Boolean(action?.output?.some((output) => output.text.trim()));
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

function formatToolPhase(phase: string) {
  switch (phase) {
    case "awaitingDecision":
      return "Awaiting decision";
    case "streamingResult":
      return "Streaming result";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "running":
      return "Running";
    case "proposed":
      return "Proposed";
    default:
      return phase;
  }
}

function formatElicitationKind(kind: string) {
  switch (kind) {
    case "userInput":
      return "Question";
    case "externalFlow":
      return "External flow";
    case "dynamicToolCall":
      return "Dynamic tool";
    case "permissionProfile":
      return "Permission profile";
    default:
      return kind || "Elicitation";
  }
}

function formatElicitationPhase(phase: string) {
  if (phase.startsWith("resolved:")) return "Answered";
  switch (phase) {
    case "open":
      return "Awaiting answer";
    case "resolving":
      return "Submitting";
    case "cancelled":
      return "Cancelled";
    default:
      return phase || "Pending";
  }
}

function DataMessagePart(part: DataMessagePartProps) {
  if (part.name === "plan" && isChatPlanData(part.data)) {
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
  const { resolveElicitation } = useChatRuntimeActions();
  const questions = elicitation.questions ?? [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [fallbackAnswer, setFallbackAnswer] = useState("");
  const [submittedResponseType, setSubmittedResponseType] =
    useState<ChatElicitationResponse["type"]>();
  const awaitingInput = elicitation.phase === "open" && !submittedResponseType;
  const phase = submittedResponseType
    ? submittedResponseType === "cancel"
      ? "cancelled"
      : "resolved:Answers"
    : elicitation.phase;
  const title = elicitation.title || "Question";
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
            value: (answers[question.id] ?? "").trim(),
          }))
        : [{ id: "answer", value: fallbackAnswer.trim() }];
    resume({ answers: responseAnswers, type: "answers" });
  };

  return (
    <Collapsible
      className="my-2 w-full overflow-hidden rounded-md border py-3 text-xs"
      onOpenChange={setManualOpen}
      open={open}
    >
      <CollapsibleTrigger
        className="flex min-h-9 w-full items-center gap-2 px-4 text-left"
        type="button"
      >
        <CircleHelp className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
            <span>{formatElicitationKind(elicitation.kind)}</span>
            <span aria-hidden>·</span>
            <span>{formatElicitationPhase(phase)}</span>
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
        <div className="mt-3 space-y-3 border-t px-4 pt-3">
          {elicitation.body?.trim() ? (
            <div className="whitespace-pre-wrap text-sm leading-5">
              {elicitation.body}
            </div>
          ) : null}

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
                className="min-h-20 w-full resize-y rounded-sm border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
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
                  Cancel
                </Button>
                <Button onClick={submitAnswers} size="xs" type="button">
                  <Send className="size-3.5" />
                  Submit
                </Button>
              </div>
            ) : (
              <div className="text-right text-[11px] text-muted-foreground">
                {formatElicitationPhase(phase)}
              </div>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PlanMessagePart({ plan }: { plan: ChatPlanData }) {
  const aui = useAui();
  const chatOptions = useChatOptions();
  const { setMode } = useChatRuntimeActions();
  const toast = useToast();
  const isLastMessage = useAuiState((state) => state.message.isLast);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [open, setOpen] = useState(true);
  const [startingImplementation, setStartingImplementation] = useState(false);
  const completed = plan.entries.filter(
    (entry) => entry.status === "completed",
  ).length;
  const hasDetails = plan.entries.length > 0 || Boolean(plan.text.trim());
  const buildMode = findBuildModeOption(chatOptions.modeOptions);
  const canStartImplementation =
    !isRunning &&
    !startingImplementation &&
    !chatOptions.configLoading &&
    chatOptions.canSetMode &&
    Boolean(buildMode);

  if (plan.presentation === "created" || plan.presentation === "updated") {
    return <PlanMarkerPart presentation={plan.presentation} />;
  }

  const startImplementation = async () => {
    if (!buildMode || startingImplementation) return;
    setStartingImplementation(true);
    try {
      await setMode(buildMode.value);
      aui.thread().append({
        content: [{ text: "start implementation", type: "text" }],
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: "Could not start implementation",
        variant: "destructive",
      });
    } finally {
      setStartingImplementation(false);
    }
  };

  return (
    <Collapsible
      className="w-full overflow-hidden rounded-md border bg-muted/20 text-xs"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger
        className="flex min-h-9 w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
        disabled={!hasDetails}
        type="button"
      >
        <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">Plan</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {plan.entries.length > 0 ? (
              <span>
                {completed}/{plan.entries.length} completed
              </span>
            ) : (
              <span>Draft</span>
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
          <div className="space-y-3 border-t px-3 py-2">
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
            {plan.path ? (
              <div className="flex min-w-0 items-center gap-2 rounded-sm bg-background/70 px-2 py-1.5 text-muted-foreground">
                <FileText className="size-3.5 shrink-0" />
                <span className="truncate font-mono text-[11px]">
                  {plan.path}
                </span>
              </div>
            ) : null}
            {plan.text.trim() ? (
              <div className="p-2">
                <Streamdown
                  className={assistantTextContainerClassName}
                  controls={false}
                  mode="streaming"
                  plugins={{ cjk, code: streamdownCode, math, mermaid }}
                  shikiTheme={["github-light", "github-dark"]}
                >
                  {plan.text}
                </Streamdown>
              </div>
            ) : null}
            {isLastMessage ? (
              <div className="flex justify-end border-t pt-2">
                <Button
                  disabled={!canStartImplementation}
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
                  Start implementation
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
  presentation,
}: {
  presentation: "created" | "updated";
}) {
  return (
    <div className="flex min-h-9 w-full items-center gap-2 rounded-md border px-3 py-2 text-xs">
      <ListChecks className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="truncate font-medium">
        Plan {presentation === "created" ? "created" : "updated"}
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
    case "inProgress":
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
    <div className="min-w-0 rounded-md bg-muted/50 p-2">
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
      typeLabel={isMention ? "Mention" : attachment.type}
    />
  );
}

function messageFileMention(part: unknown) {
  return (part as { mention?: unknown }).mention === true;
}
