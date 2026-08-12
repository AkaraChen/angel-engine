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
import type { ComposerTerminalSelection } from "@/features/chat/components/composer/terminal-selection-to-composer";
import type { ComposerSourceControlAttachment } from "@/features/chat/components/composer/source-control-attachments";
import type { ComposerEditorController } from "@/features/chat/components/composer/use-composer-editor";
import is from "@sindresorhus/is";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  PromptInput,
  PromptInputProvider,
} from "@/components/ai-elements/prompt-input";
import { useToast } from "@/components/ui/toast";
import { ComposerEditor } from "@/features/chat/components/composer/composer-editor";
import {
  appendPasteSourceUrls,
  attachmentErrorMessage,
  attachmentErrorTitle,
} from "@/features/chat/components/composer/composer-helpers";
import { appendTerminalSelections } from "@/features/chat/components/composer/terminal-selection-to-composer";
import { appendSourceControlContexts } from "@/features/chat/components/composer/source-control-attachments";

export interface ChatComposerSubmission {
  files: PromptInputFile[];
  sourceControlAttachments: ComposerSourceControlAttachment[];
  mentionedFiles: ComposerMentionedFile[];
  selectedSkills: ComposerMentionedSkill[];
  terminalSelections: ComposerTerminalSelection[];
  text: string;
  worktreeSetupApproval?: string;
}

export type ChatComposerBeforeSubmitResult = boolean | string;

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
  onBeforeSubmit?: () =>
    | ChatComposerBeforeSubmitResult
    | Promise<ChatComposerBeforeSubmitResult>;
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
  const {
    sourceControlAttachments,
    mentionedFiles,
    pasteSourceUrls,
    reset,
    selectedSkills,
    terminalSelections,
  } = controller;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const hasMessage =
        message.text.length > 0 ||
        message.files.length > 0 ||
        mentionedFiles.length > 0 ||
        selectedSkills.length > 0 ||
        sourceControlAttachments.length > 0 ||
        terminalSelections.length > 0;
      if (!hasMessage) return;
      const beforeSubmitResult = onBeforeSubmit ? await onBeforeSubmit() : true;
      if (beforeSubmitResult === false) return;

      // Capture the submission, then clear right away: awaiting the whole
      // turn first would run reset() against an editor that may have been
      // unmounted mid-turn (draft composers navigate to the created chat).
      const terminalSnapshot = [...terminalSelections];
      const sourceControlSnapshot = [...sourceControlAttachments];
      const submission: ChatComposerSubmission = {
        files: message.files as PromptInputFile[],
        sourceControlAttachments: sourceControlSnapshot,
        mentionedFiles: [...mentionedFiles],
        selectedSkills: [...selectedSkills],
        terminalSelections: terminalSnapshot,
        text: appendTerminalSelections(
          appendSourceControlContexts(
            appendPasteSourceUrls(message.text, pasteSourceUrls),
            sourceControlSnapshot,
          ),
          terminalSnapshot,
        ),
        worktreeSetupApproval:
          typeof beforeSubmitResult === "string"
            ? beforeSubmitResult
            : undefined,
      };
      reset();
      await send(submission);
    },
    [
      sourceControlAttachments,
      mentionedFiles,
      onBeforeSubmit,
      pasteSourceUrls,
      reset,
      selectedSkills,
      send,
      terminalSelections,
    ],
  );

  const handleAttachmentError = useCallback(
    (error: { code: AttachmentInputError["code"]; message: string }) => {
      toast({
        description:
          error.code === "submit" && is.nonEmptyString(error.message)
            ? error.message
            : attachmentErrorMessage(error.code, t),
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
