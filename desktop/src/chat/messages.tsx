import { useState } from 'react';
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
import { StreamdownTextPrimitive } from '@assistant-ui/react-streamdown';
import { cjk } from '@streamdown/cjk';
import { code as streamdownCode } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import {
  AlertCircleIcon,
  BrainCircuit,
  Check,
  ChevronDown,
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

import { ToolGroup } from '@/components/assistant-ui/tool-group';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
          <UserMessageParts />
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

function UserMessageParts() {
  return <MessagePrimitive.Parts components={userMessagePartComponents} />;
}

function AssistantMessageParts() {
  return <MessagePrimitive.Parts components={assistantMessagePartComponents} />;
}

const userMessagePartComponents = {
  Text: PlainTextMessagePart,
  Source: NullMessagePart,
  Image: ImageMessagePart,
  File: FileMessagePart,
  data: {
    Fallback: DataMessagePart,
  },
};

const assistantMessagePartComponents = {
  Text: AssistantTextMessagePart,
  Reasoning: ReasoningMessagePart,
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

function PlainTextMessagePart(part: Extract<EnrichedPartState, { type: 'text' }>) {
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

function AssistantTextMessagePart(
  part: Extract<EnrichedPartState, { type: 'text' }>
) {
  if (part.type === 'text' && part.status.type === 'running' && !part.text) {
    return (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Thinking
      </span>
    );
  }

  return (
    <StreamdownTextPrimitive
      caret="block"
      containerClassName="min-w-0 max-w-none text-sm leading-6 [&_a]:underline [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.86em] [&_h1]:mb-3 [&_h1]:mt-1 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-0 [&_p+p]:mt-3 [&_pre]:my-3 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
      controls
      mode="streaming"
      plugins={{ cjk, code: streamdownCode, math, mermaid }}
      shikiTheme={['github-light', 'github-dark']}
    />
  );
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
  const hasDetails = Boolean(part.argsText || outputText || errorText);
  const [manualOpen, setManualOpen] = useState(false);
  const open = hasDetails && manualOpen;

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
            {part.argsText && <ToolPreBlock label="Input" value={part.argsText} />}
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
            'size-4 shrink-0 text-muted-foreground transition-transform',
            !open && '-rotate-90'
          )}
        />
      )}
    </>
  );

  const className = cn(
    'flex min-h-9 w-full items-center gap-2 px-3 py-2 text-left',
    details && 'hover:bg-muted/40'
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
