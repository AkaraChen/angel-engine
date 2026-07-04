import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

import { ComposerPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import {
  ArrowUp,
  StopCircle as CircleStop,
  Quotes as Quote,
  SlidersHorizontal,
  X,
} from "@phosphor-icons/react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
  createAttachmentFromPromptFile,
  createMentionAttachment,
  createSkillMentionAttachment,
} from "@/features/chat/components/composer/composer-attachments";
import { ComposerEditor } from "@/features/chat/components/composer/composer-editor";
import {
  attachmentErrorMessage,
  attachmentErrorTitle,
} from "@/features/chat/components/composer/composer-helpers";
import {
  ComposerModelMenu,
  ComposerOptionSelect,
  PromptAttachmentButton,
} from "@/features/chat/components/composer/composer-menus";
import { PlanModeToggleButton } from "@/features/chat/components/composer/composer-plan-mode";
import { useComposerEditor } from "@/features/chat/components/composer/use-composer-editor";
import { iconButtonClass } from "@/features/chat/components/thread-styles";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";

const composerInputGroupClassName =
  "overflow-visible !rounded-xl !border !border-border-subtle !bg-background/86 !shadow-panel backdrop-blur-xl transition-[background-color] has-[textarea]:!rounded-xl has-[>[data-align=block-end]]:!rounded-xl has-[>[data-align=block-start]]:!rounded-xl has-[[data-slot=input-group-control]:focus-visible]:!ring-0 focus-within:!bg-background/94 dark:!bg-card/82 dark:focus-within:!bg-card/90 [&_button:focus-visible]:!border-transparent [&_button:focus-visible]:!ring-0 [&_button]:shadow-none";
const quoteTextClassName = "line-clamp-2 flex-1 text-muted-foreground";

export function AssistantComposer({
  onBeforeSubmit,
}: {
  onBeforeSubmit?: () => boolean | Promise<boolean>;
}) {
  const { t } = useTranslation();
  const aui = useAui();
  const canCancel = useAuiState((state) => state.composer.canCancel);
  const isInputDisabled = useAuiState((state) => state.thread.isDisabled);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const hasQuote = useAuiState((state) => Boolean(state.composer.quote));
  const toast = useToast();
  const editor = useComposerEditor();
  const { draftText, mentionedFiles, reset, selectedSkills } = editor;

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const text = message.text;
      const hasMessage =
        text.length > 0 ||
        message.files.length > 0 ||
        mentionedFiles.length > 0 ||
        selectedSkills.length > 0;
      if (!hasMessage) {
        return;
      }
      if (onBeforeSubmit && !(await onBeforeSubmit())) {
        return;
      }
      const composer = aui.composer();

      composer.setText(text);

      try {
        await Promise.all([
          ...message.files.map(async (file) =>
            composer.addAttachment(createAttachmentFromPromptFile(file, t)),
          ),
          ...mentionedFiles.map(async (file) =>
            composer.addAttachment(createMentionAttachment(file)),
          ),
          ...selectedSkills.map(async (skill) =>
            composer.addAttachment(createSkillMentionAttachment(skill)),
          ),
        ]);

        composer.send();
        reset();
      } catch (error) {
        await composer.clearAttachments().catch(() => undefined);
        throw error;
      }
    },
    [aui, mentionedFiles, onBeforeSubmit, reset, selectedSkills, t],
  );

  const handleAttachmentError = useCallback(
    (error: {
      code: "max_files" | "max_file_size" | "accept" | "file_read" | "submit";
      message: string;
    }) => {
      toast({
        description: attachmentErrorMessage(error.code, t),
        title: attachmentErrorTitle(error.code, t),
        variant: "destructive",
      });
    },
    [t, toast],
  );

  const cancelRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  const quoteHeader = hasQuote ? (
    <ComposerPrimitive.Quote
      className="
        flex items-start gap-2 rounded-md border border-border-subtle
        bg-surface-1 p-2 text-sm
      "
    >
      <Quote
        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
        weight="duotone"
      />
      <ComposerPrimitive.QuoteText className={quoteTextClassName} />
      <ComposerPrimitive.QuoteDismiss className={iconButtonClass}>
        <X className="size-3.5" />
      </ComposerPrimitive.QuoteDismiss>
    </ComposerPrimitive.Quote>
  ) : null;

  return (
    <PromptInput
      inputGroupClassName={composerInputGroupClassName}
      multiple
      onError={handleAttachmentError}
      onSubmit={handleSubmit}
    >
      <ComposerEditor
        blockSubmit={isRunning}
        canCancel={canCancel}
        controller={editor}
        disabled={isInputDisabled}
        headerClassName="flex-col items-stretch gap-2 px-3! pt-3! pb-2!"
        headerLeading={quoteHeader}
        onCancel={cancelRun}
        textareaClassName="
          max-h-40 min-h-(--workspace-composer-min-height) px-3.5 py-3
          [font-size:var(--workspace-composer-text-size)]
          leading-(--workspace-composer-line-height)
          placeholder:text-muted-foreground/62
        "
      />

      <AssistantComposerFooter draftText={draftText} />
    </PromptInput>
  );
}

function AssistantComposerFooter({ draftText }: { draftText: string }) {
  const { t } = useTranslation();
  const aui = useAui();
  const attachments = usePromptInputAttachments();
  const chatOptions = useChatOptions();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const isEmpty = draftText.length === 0 && attachments.files.length === 0;

  const stopRun = useCallback(() => {
    aui.composer().cancel();
  }, [aui]);

  return (
    <PromptInputFooter className="flex-wrap px-3! py-2!">
      <PromptInputTools className="flex-wrap">
        <PromptAttachmentButton />
        <ComposerModelMenu
          disabled={isRunning}
          hideProvider
          options={chatOptions}
        />
      </PromptInputTools>
      <div className="flex min-w-0 items-center gap-2">
        <PlanModeToggleButton disabled={isRunning} options={chatOptions} />
        <ComposerOptionSelect
          className="hidden max-w-28"
          disabled={
            isRunning ||
            !chatOptions.canSetMode ||
            chatOptions.modeOptions.length < 2
          }
          icon={<SlidersHorizontal weight="duotone" />}
          label={t("composer.mode")}
          onValueChange={(value) => {
            void chatOptions.setMode(value);
          }}
          options={chatOptions.modeOptions}
          value={chatOptions.mode}
        />
        {isRunning ? (
          <Button
            className="
              h-8 rounded-md border-border-subtle bg-background/55 px-3 text-xs
              focus-visible:ring-0!
              dark:bg-card/60
            "
            onClick={stopRun}
            size="sm"
            type="button"
            variant="outline"
          >
            <CircleStop />
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button
          aria-label={t("common.send")}
          className="
            group/send size-8 rounded-full p-0 shadow-none
            focus-visible:ring-0!
            active:scale-95
          "
          disabled={isRunning || isEmpty}
          size="sm"
          type="submit"
        >
          <ArrowUp
            className="
              transition-transform duration-150 ease-swift
              group-hover/send:-translate-y-px
            "
          />
          <span className="sr-only">{t("common.send")}</span>
        </Button>
      </div>
    </PromptInputFooter>
  );
}
