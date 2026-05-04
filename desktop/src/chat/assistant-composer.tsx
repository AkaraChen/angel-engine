import {
  useCallback,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import {
  ComposerPrimitive,
  useAui,
  useAuiState,
  type CreateAttachment,
} from '@assistant-ui/react';
import {
  ArrowUp,
  CircleStop,
  FileText,
  Paperclip,
  Quote,
  X,
} from 'lucide-react';

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input';
import { Button } from '@/components/ui/button';
import { iconButtonClass } from '@/chat/thread-styles';

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
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isEmpty =
    draftText.trim().length === 0 && attachments.files.length === 0;

  const stopRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  return (
    <PromptInputFooter className="border-t !px-2 !py-2">
      <PromptInputTools>
        <PromptAttachmentButton />
      </PromptInputTools>
      <div className="flex items-center gap-2">
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
