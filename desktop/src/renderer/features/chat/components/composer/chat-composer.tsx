import type { ReactNode } from "react";
import type {
  PromptInputFile,
  PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import type {
  ComposerMentionedFile,
  ComposerMentionedSkill,
} from "@/features/chat/components/composer/composer-attachments";
import type { AttachmentInputError } from "@/features/chat/components/composer/composer-helpers";
import type { ComposerEditorController } from "@/features/chat/components/composer/use-composer-editor";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  PromptInput,
  PromptInputProvider,
} from "@/components/ai-elements/prompt-input";
import { useToast } from "@/components/ui/toast";
import { ComposerEditor } from "@/features/chat/components/composer/composer-editor";
import {
  appendPasteSourceUrl,
  attachmentErrorMessage,
  attachmentErrorTitle,
} from "@/features/chat/components/composer/composer-helpers";

export interface ChatComposerSubmission {
  files: PromptInputFile[];
  mentionedFiles: ComposerMentionedFile[];
  selectedSkills: ComposerMentionedSkill[];
  text: string;
}

export interface ChatComposerProps {
  allowAttachments?: boolean;
  blockSubmit?: boolean;
  canCancel?: boolean;
  children: ReactNode;
  controller: ComposerEditorController;
  disabled?: boolean;
  headerClassName?: string;
  headerLeading?: ReactNode;
  inputGroupClassName?: string;
  onBeforeSubmit?: () => boolean | Promise<boolean>;
  onCancel?: () => void;
  rows?: number;
  send: (submission: ChatComposerSubmission) => Promise<void>;
  textareaClassName?: string;
}

export function ChatComposer({
  allowAttachments = true,
  blockSubmit,
  canCancel,
  children,
  controller,
  disabled,
  headerClassName,
  headerLeading,
  inputGroupClassName,
  onBeforeSubmit,
  onCancel,
  rows,
  send,
  textareaClassName,
}: ChatComposerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { getMarkdown, mentionedFiles, pasteSourceUrl, reset, selectedSkills } =
    controller;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const hasMessage =
        message.text.length > 0 ||
        message.files.length > 0 ||
        mentionedFiles.length > 0 ||
        selectedSkills.length > 0;
      if (!hasMessage) return;
      if (onBeforeSubmit && !(await onBeforeSubmit())) return;

      await send({
        files: message.files as PromptInputFile[],
        mentionedFiles,
        selectedSkills,
        text: appendPasteSourceUrl(message.text, pasteSourceUrl),
      });
      if (getMarkdown() === message.text) reset();
    },
    [
      getMarkdown,
      mentionedFiles,
      onBeforeSubmit,
      pasteSourceUrl,
      reset,
      selectedSkills,
      send,
    ],
  );

  const handleAttachmentError = useCallback(
    (error: { code: AttachmentInputError["code"]; message: string }) => {
      toast({
        description: attachmentErrorMessage(error.code, t),
        title: attachmentErrorTitle(error.code, t),
        variant: "destructive",
      });
    },
    [t, toast],
  );

  return (
    <PromptInputProvider>
      <PromptInput
        inputGroupClassName={inputGroupClassName}
        multiple
        onError={handleAttachmentError}
        onSubmit={handleSubmit}
      >
        <ComposerEditor
          allowAttachments={allowAttachments}
          blockSubmit={blockSubmit}
          canCancel={canCancel}
          controller={controller}
          disabled={disabled}
          headerClassName={headerClassName}
          headerLeading={headerLeading}
          onCancel={onCancel}
          rows={rows}
          textareaClassName={textareaClassName}
        />
        {children}
      </PromptInput>
    </PromptInputProvider>
  );
}
