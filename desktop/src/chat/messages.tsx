import {
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  type CompleteAttachment,
  type EnrichedPartState,
  type ToolCallMessagePartProps,
} from '@assistant-ui/react';
import {
  AlertCircleIcon,
  BrainCircuit,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isChatToolAction, type ChatToolAction } from '@/shared/chat';
import {
  iconButtonClass,
  messageActionFooterClass,
} from '@/chat/thread-styles';

export function UserMessage() {
  return (
    <MessagePrimitive.Root className="group flex justify-end">
      <div className="flex max-w-[78%] flex-col items-end gap-1.5">
        <MessagePrimitive.Attachments>
          {({ attachment }) => (
            <MessageAttachment attachment={attachment} key={attachment.id} />
          )}
        </MessagePrimitive.Attachments>
        <div className="rounded-md bg-primary px-3 py-2 text-sm leading-6 text-primary-foreground">
          <MessageParts />
        </div>
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
            <ActionBarPrimitive.Copy className={cn(iconButtonClass, 'group/copy')}>
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
          <MessageParts />
        </div>
        <div className={messageActionFooterClass}>
          <MessageBranchPicker />
          <ActionBarPrimitive.Root
            autohide="not-last"
            autohideFloat="always"
            className="flex gap-0.5 data-[floating]:opacity-0 data-[floating]:transition-opacity group-hover:data-[floating]:opacity-100"
            hideWhenRunning
          >
            <ActionBarPrimitive.Copy className={cn(iconButtonClass, 'group/copy')}>
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
                'data-[submitted]:bg-emerald-500/10 data-[submitted]:text-emerald-700'
              )}
            >
              <ThumbsUp className="size-3.5" />
              <span className="sr-only">Helpful</span>
            </ActionBarPrimitive.FeedbackPositive>
            <ActionBarPrimitive.FeedbackNegative
              className={cn(
                iconButtonClass,
                'data-[submitted]:bg-rose-500/10 data-[submitted]:text-rose-700'
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

function MessageParts() {
  return <MessagePrimitive.Parts components={messagePartComponents} />;
}

const messagePartComponents = {
  Text: TextMessagePart,
  Reasoning: ReasoningMessagePart,
  Source: NullMessagePart,
  Image: ImageMessagePart,
  File: FileMessagePart,
  tools: {
    Fallback: ToolActionMessagePart,
  },
  data: {
    Fallback: DataMessagePart,
  },
};

function TextMessagePart(part: Extract<EnrichedPartState, { type: 'text' }>) {
  if (part.type === 'text') {
    if (part.status.type === 'running' && !part.text) {
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

function ReasoningMessagePart(
  part: Extract<EnrichedPartState, { type: 'reasoning' }>
) {
  if (!part.text.trim()) return null;

  return (
    <div className="mb-3 w-full text-muted-foreground">
      <div className="flex items-center gap-2 text-xs font-medium">
        <BrainCircuit className="size-3.5" />
        Reasoning
      </div>
      <div className="mt-2 whitespace-pre-wrap border-l border-border pl-3 text-xs leading-5">
        {part.text}
      </div>
    </div>
  );
}

function ImageMessagePart(part: Extract<EnrichedPartState, { type: 'image' }>) {
  return (
    <img
      alt={part.filename ?? 'image attachment'}
      className="my-2 max-h-80 rounded-md border object-contain"
      src={part.image}
    />
  );
}

function FileMessagePart(part: Extract<EnrichedPartState, { type: 'file' }>) {
  return (
    <div className="my-2 inline-flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
      <FileText className="size-3.5" />
      {part.filename ?? part.mimeType}
    </div>
  );
}

function ToolActionMessagePart(part: ToolCallMessagePartProps) {
  const action = isChatToolAction(part.artifact) ? part.artifact : undefined;
  const phase = action?.phase ?? part.status.type;
  const title = action?.title || action?.inputSummary || part.toolName;
  const outputText = getToolOutputText(action, part.result);
  const errorText = action?.error?.message;
  const isRunning = isRunningToolPhase(phase);
  const isFailed = Boolean(errorText) || phase === 'failed';

  return (
    <div className="my-2 w-full overflow-hidden rounded-md border bg-muted/20 text-xs">
      <div className="flex min-h-9 items-center gap-2 border-b px-3 py-2">
        <ToolStatusIcon failed={isFailed} running={isRunning} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
            <span>{action?.kind || part.toolName}</span>
            <span aria-hidden>·</span>
            <span>{formatToolPhase(phase)}</span>
          </div>
        </div>
      </div>
      {(part.argsText || outputText || errorText) && (
        <div className="space-y-2 px-3 py-2">
          {part.argsText && <ToolPreBlock label="Input" value={part.argsText} />}
          {errorText && <ToolPreBlock label="Error" tone="error" value={errorText} />}
          {!errorText && outputText && (
            <ToolPreBlock label="Output" value={outputText} />
          )}
        </div>
      )}
    </div>
  );
}

function ToolStatusIcon({
  failed,
  running,
}: {
  failed: boolean;
  running: boolean;
}) {
  if (failed) return <AlertCircleIcon className="size-3.5 shrink-0 text-rose-600" />;
  if (running) return <Loader2 className="size-3.5 shrink-0 animate-spin" />;
  return <Check className="size-3.5 shrink-0 text-emerald-600" />;
}

function ToolPreBlock({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: 'error';
  value: string;
}) {
  return (
    <div>
      <div
        className={cn(
          'mb-1 text-[11px] font-medium uppercase text-muted-foreground',
          tone === 'error' && 'text-rose-600'
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

function getToolOutputText(action: ChatToolAction | undefined, result: unknown) {
  if (action?.outputText?.trim()) return action.outputText;
  if (typeof result === 'string') return result;
  if (result === undefined || result === null) return '';
  return JSON.stringify(result, null, 2);
}

function isRunningToolPhase(phase: string) {
  return (
    phase === 'proposed' ||
    phase === 'awaitingDecision' ||
    phase === 'running' ||
    phase === 'streamingResult'
  );
}

function formatToolPhase(phase: string) {
  switch (phase) {
    case 'awaitingDecision':
      return 'Awaiting decision';
    case 'streamingResult':
      return 'Streaming result';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    case 'running':
      return 'Running';
    case 'proposed':
      return 'Proposed';
    default:
      return phase;
  }
}

function DataMessagePart(part: Extract<EnrichedPartState, { type: 'data' }>) {
  return <JsonBlock label={part.name} value={part.data} />;
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
        {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function MessageAttachment({ attachment }: { attachment: CompleteAttachment }) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{attachment.name}</span>
      <span className="text-muted-foreground">{attachment.type}</span>
    </div>
  );
}
