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
import type { ComposerGitHubAttachment } from "@/features/chat/components/composer/github-attachments";
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
import { appendGitHubContexts } from "@/features/chat/components/composer/github-attachments";

export interface ChatComposerSubmission {
  files: PromptInputFile[];
  githubAttachments: ComposerGitHubAttachment[];
  mentionedFiles: ComposerMentionedFile[];
  selectedSkills: ComposerMentionedSkill[];
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
    githubAttachments,
    mentionedFiles,
    pasteSourceUrls,
    reset,
    selectedSkills,
  } = controller;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const hasMessage =
        message.text.length > 0 ||
        message.files.length > 0 ||
        mentionedFiles.length > 0 ||
        selectedSkills.length > 0 ||
        githubAttachments.length > 0;
      if (!hasMessage) return;
      const beforeSubmitResult = onBeforeSubmit ? await onBeforeSubmit() : true;
      if (beforeSubmitResult === false) return;

      // Capture the submission, then clear right away: awaiting the whole
      // turn first would run reset() against an editor that may have been
      // unmounted mid-turn (draft composers navigate to the created chat).
      const githubSnapshot = [...githubAttachments];
      const submission: ChatComposerSubmission = {
        files: message.files as PromptInputFile[],
        githubAttachments: githubSnapshot,
        mentionedFiles: [...mentionedFiles],
        selectedSkills: [...selectedSkills],
        text: appendGitHubContexts(
          appendPasteSourceUrls(message.text, pasteSourceUrls),
          githubSnapshot,
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
      githubAttachments,
      mentionedFiles,
      onBeforeSubmit,
      pasteSourceUrls,
      reset,
      selectedSkills,
      send,
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
