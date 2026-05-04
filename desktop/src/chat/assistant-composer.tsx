import {
  useCallback,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  ComposerPrimitive,
  useAui,
  useAuiState,
  type CreateAttachment,
} from '@assistant-ui/react';
import {
  ArrowUp,
  Bot,
  Brain,
  CircleStop,
  Cpu,
  FileText,
  Paperclip,
  Quote,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { useChatOptions } from '@/chat/chat-options-context';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import { iconButtonClass } from '@/chat/thread-styles';
import {
  AGENT_OPTIONS,
  normalizeAgentRuntime,
  type AgentValueOption,
} from '@/shared/agents';

export function AssistantComposer() {
  const aui = useAui();
  const canCancel = useAuiState((state) => state.composer.canCancel);
  const isInputDisabled = useAuiState((state) => state.thread.isDisabled);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const [draftText, setDraftText] = useState('');

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const composer = aui.composer();
      const text = message.text.trim() ? message.text : '';

      composer.setText(text);

      for (const file of message.files) {
        await composer.addAttachment(createAttachmentFromPromptFile(file));
      }

      if (!composer.getState().isEmpty) {
        composer.send();
        setDraftText('');
      }
    },
    [aui]
  );

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftText(event.currentTarget.value);
    },
    []
  );

  const handleTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Escape' && canCancel) {
        event.preventDefault();
        aui.composer().cancel();
        return;
      }

      if (event.key === 'Enter' && !event.shiftKey && isRunning) {
        event.preventDefault();
      }
    },
    [aui, canCancel, isRunning]
  );

  return (
    <PromptInput
      inputGroupClassName="!rounded-md !border !border-border !bg-card shadow-sm has-[textarea]:!rounded-md has-[>[data-align=block-end]]:!rounded-md has-[>[data-align=block-start]]:!rounded-md"
      multiple
      onSubmit={handleSubmit}
    >
      <AssistantComposerHeader />

      <PromptInputBody>
        <PromptInputTextarea
          className="max-h-36 min-h-16 text-sm leading-6"
          disabled={isInputDisabled}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          placeholder="Ask Angel Engine to inspect, patch, test, or explain..."
          rows={2}
          value={draftText}
        />
      </PromptInputBody>

      <AssistantComposerFooter draftText={draftText} />
    </PromptInput>
  );
}

function AssistantComposerHeader() {
  const attachments = usePromptInputAttachments();
  const hasQuote = useAuiState((state) => Boolean(state.composer.quote));

  if (!hasQuote && attachments.files.length === 0) return null;

  return (
    <PromptInputHeader className="flex-col items-stretch gap-2 !px-2 !py-2">
      {hasQuote ? (
        <ComposerPrimitive.Quote className="flex items-start gap-2 rounded-md border bg-muted/40 p-2 text-sm">
          <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <ComposerPrimitive.QuoteText className="line-clamp-2 flex-1 text-muted-foreground" />
          <ComposerPrimitive.QuoteDismiss className={iconButtonClass}>
            <X className="size-3.5" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>
      ) : null}

      {attachments.files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.files.map((file) => (
            <button
              className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              key={file.id}
              onClick={() => attachments.remove(file.id)}
              type="button"
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate">{file.filename ?? 'Attachment'}</span>
              <X className="size-3.5 shrink-0" />
            </button>
          ))}
        </div>
      ) : null}
    </PromptInputHeader>
  );
}

function AssistantComposerFooter({ draftText }: { draftText: string }) {
  const aui = useAui();
  const attachments = usePromptInputAttachments();
  const chatOptions = useChatOptions();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isEmpty =
    draftText.trim().length === 0 && attachments.files.length === 0;

  const stopRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  return (
    <PromptInputFooter className="flex-wrap border-t !px-2 !py-2">
      <PromptInputTools className="flex-wrap">
        <PromptAttachmentButton />
        <ComposerOptionSelect
          disabled={chatOptions.runtimeLocked || isRunning}
          icon={<Bot />}
          label="Agent"
          onValueChange={(value) =>
            chatOptions.setRuntime(normalizeAgentRuntime(value))
          }
          options={AGENT_OPTIONS.map((agent) => ({
            label: agent.label,
            value: agent.id,
          }))}
          title={
            chatOptions.runtimeLocked
              ? 'Agent is fixed for this chat'
              : 'Agent'
          }
          value={chatOptions.runtime}
        />
        <ComposerOptionSelect
          className="max-w-44"
          disabled={
            isRunning ||
            chatOptions.configLoading ||
            chatOptions.modelOptions.length < 2
          }
          icon={<Cpu />}
          label="Model"
          onValueChange={chatOptions.setModel}
          options={chatOptions.modelOptions}
          title={
            chatOptions.configLoading ? 'Loading models from agent' : 'Model'
          }
          value={chatOptions.model}
        />
        <ComposerOptionSelect
          disabled={isRunning || chatOptions.reasoningEffortOptions.length < 2}
          icon={<Brain />}
          label="Reasoning effort"
          onValueChange={chatOptions.setReasoningEffort}
          options={chatOptions.reasoningEffortOptions}
          value={chatOptions.reasoningEffort}
        />
      </PromptInputTools>
      <div className="flex min-w-0 items-center gap-2">
        <ComposerOptionSelect
          className="max-w-28"
          disabled={isRunning || chatOptions.modeOptions.length < 2}
          icon={<SlidersHorizontal />}
          label="Mode"
          onValueChange={chatOptions.setMode}
          options={chatOptions.modeOptions}
          value={chatOptions.mode}
        />
        {isRunning ? (
          <Button onClick={stopRun} size="sm" type="button" variant="outline">
            <CircleStop />
            Cancel
          </Button>
        ) : null}
        <Button disabled={isRunning || isEmpty} size="sm" type="submit">
          <ArrowUp />
          Send
        </Button>
      </div>
    </PromptInputFooter>
  );
}

function ComposerOptionSelect({
  className,
  disabled,
  icon,
  label,
  onValueChange,
  options,
  title,
  value,
}: {
  className?: string;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  onValueChange: (value: string) => void;
  options: AgentValueOption[];
  title?: string;
  value: string;
}) {
  return (
    <PromptInputSelect
      disabled={disabled}
      onValueChange={onValueChange}
      value={value}
    >
      <PromptInputSelectTrigger
        aria-label={label}
        className={[
          'h-8 max-w-36 rounded-md border border-border bg-background/70 px-2 text-xs',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        size="sm"
        title={title ?? label}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
            {icon}
          </span>
          <PromptInputSelectValue />
        </span>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent className="rounded-md">
        {options.map((option) => (
          <PromptInputSelectItem
            className="rounded-sm"
            key={option.value}
            value={option.value}
          >
            {option.label}
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  );
}

function PromptAttachmentButton() {
  const attachments = usePromptInputAttachments();

  return (
    <Button
      onClick={attachments.openFileDialog}
      size="icon-sm"
      title="Attach files"
      type="button"
      variant="ghost"
    >
      <Paperclip />
      <span className="sr-only">Attach files</span>
    </Button>
  );
}

function createAttachmentFromPromptFile(
  file: PromptInputMessage['files'][number]
): CreateAttachment {
  const filename = file.filename ?? 'Attachment';
  const mediaType = file.mediaType ?? 'application/octet-stream';
  const url = file.url ?? '';
  const isImage = mediaType.startsWith('image/');

  return {
    content: [
      isImage
        ? {
            filename,
            image: url,
            type: 'image',
          }
        : {
            data: url,
            filename,
            mimeType: mediaType,
            type: 'file',
          },
    ],
    contentType: mediaType,
    name: filename,
    type: isImage ? 'image' : 'file',
  };
}
