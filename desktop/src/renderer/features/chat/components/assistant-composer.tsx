import type {
  ChatAvailableCommand,
  ChatAvailableSkill,
  ProjectFileSearchResult,
} from "@shared/chat";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";

import type {
  ComposerMentionedFile,
  ComposerMentionedSkill,
} from "@/features/chat/components/composer/composer-attachments";
import { ComposerPrimitive, useAui, useAuiState } from "@assistant-ui/react";
import {
  RiArrowUpLine as ArrowUp,
  RiStopCircleLine as CircleStop,
  RiDoubleQuotesL as Quote,
  RiEqualizer2Line as SlidersHorizontal,
  RiCloseLine as X,
} from "@remixicon/react";
import is from "@sindresorhus/is";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import { ComposerAssistPanel } from "@/features/chat/components/composer/composer-assist-panel";
import {
  createAttachmentFromPromptFile,
  createMentionAttachment,
  createSkillMentionAttachment,
} from "@/features/chat/components/composer/composer-attachments";
import {
  attachmentErrorMessage,
  attachmentErrorTitle,
  filterSkills,
  filterSlashCommands,
  replaceMentionQuery,
  replaceSkillQuery,
  skillQueryFromDraft,
  slashQueryFromDraft,
} from "@/features/chat/components/composer/composer-helpers";
import {
  ComposerModelMenu,
  ComposerOptionSelect,
  PromptAttachmentButton,
} from "@/features/chat/components/composer/composer-menus";
import { PlanModeToggleButton } from "@/features/chat/components/composer/composer-plan-mode";
import { iconButtonClass } from "@/features/chat/components/thread-styles";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";
import {
  mentionQueryFromDraft,
  useProjectFileMentionSearch,
} from "@/features/chat/state/use-project-file-mention-search";
import { cn } from "@/platform/utils";

const composerInputGroupClassName =
  "overflow-visible !rounded-lg !border !border-foreground/[0.08] !bg-background/86 backdrop-blur-xl transition-[border-color,background-color] has-[textarea]:!rounded-lg has-[>[data-align=block-end]]:!rounded-lg has-[>[data-align=block-start]]:!rounded-lg has-[[data-slot=input-group-control]:focus-visible]:!border-foreground/14 has-[[data-slot=input-group-control]:focus-visible]:!ring-0 focus-within:!border-foreground/14 focus-within:!bg-background/94 dark:!border-white/[0.09] dark:!bg-card/82 dark:focus-within:!border-white/14 dark:focus-within:!bg-card/90 [&_button:focus-visible]:!border-transparent [&_button:focus-visible]:!ring-0 [&_button]:shadow-none";

export function AssistantComposer({
  floatingAccessory,
  onBeforeSubmit,
}: {
  floatingAccessory?: ReactNode;
  onBeforeSubmit?: () => boolean | Promise<boolean>;
}) {
  const { t } = useTranslation();
  const aui = useAui();
  const environment = useChatEnvironment();
  const canCancel = useAuiState((state) => state.composer.canCancel);
  const isInputDisabled = useAuiState((state) => state.thread.isDisabled);
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const toast = useToast();
  const [draftText, setDraftText] = useState("");
  const [mentionedFiles, setMentionedFiles] = useState<ComposerMentionedFile[]>(
    [],
  );
  const [selectedSkills, setSelectedSkills] = useState<
    ComposerMentionedSkill[]
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const projectToolsEnabled =
    environment.isProjectChat && environment.projectPath !== undefined;
  const mentionQuery = projectToolsEnabled
    ? mentionQueryFromDraft(draftText)
    : null;
  const fileMentionOpen = mentionQuery !== null;
  const { fileResults, fileSearchLoading } = useProjectFileMentionSearch({
    enabled: projectToolsEnabled,
    mentionQuery,
    projectRoot: environment.projectPath,
  });
  const slashQuery = projectToolsEnabled
    ? slashQueryFromDraft(draftText)
    : null;
  const slashCommands = useMemo(
    () =>
      slashQuery === null
        ? []
        : filterSlashCommands(environment.availableCommands, slashQuery),
    [environment.availableCommands, slashQuery],
  );
  const slashCommandOpen = slashQuery !== null;
  const slashCommandsLoading = environment.availableCommandsLoading;
  const skillQuery = skillQueryFromDraft(draftText);
  const skills = useMemo(
    () =>
      skillQuery === null
        ? []
        : filterSkills(environment.availableSkills, skillQuery),
    [environment.availableSkills, skillQuery],
  );
  const skillOpen = skillQuery !== null;
  const skillsLoading = environment.availableSkillsLoading;
  const hasFloatingAccessory = !is.falsy(floatingAccessory);

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
        setDraftText("");
        setMentionedFiles([]);
        setSelectedSkills([]);
      } catch (error) {
        await composer.clearAttachments().catch(() => undefined);
        throw error;
      }
    },
    [aui, mentionedFiles, onBeforeSubmit, selectedSkills, t],
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

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftText(event.currentTarget.value);
    },
    [],
  );

  const insertSlashCommand = useCallback(
    (command?: ChatAvailableCommand) => {
      if (!command) return;
      const next = draftText.replace(/^\/\S*/, `/${command.name}`);
      setDraftText(`${next.trimEnd()} `);
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [draftText],
  );

  const insertSkill = useCallback((skill?: ChatAvailableSkill) => {
    if (!skill) return;
    setSelectedSkills((current) => {
      if (current.some((item) => item.path === skill.path)) return current;
      return [...current, { ...skill, id: skill.path }];
    });
    setDraftText((current) => replaceSkillQuery(current, skill.name));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const selectMentionedFile = useCallback((file: ProjectFileSearchResult) => {
    setMentionedFiles((current) => {
      if (current.some((item) => item.path === file.path)) return current;
      return [...current, { ...file, id: file.path }];
    });
    setDraftText((current) => replaceMentionQuery(current, file.relativePath));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const removeMentionedFile = useCallback((id: string) => {
    setMentionedFiles((current) => current.filter((file) => file.id !== id));
  }, []);

  const handleTextKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        if (slashCommandOpen || skillOpen || fileMentionOpen) {
          setDraftText((current) => {
            if (slashCommandOpen) return "";
            if (skillOpen) return current.replace(/(?:^|\s)\$[^\s$]*$/, "");
            return current.replace(/(?:^|\s)@[^\s@]*$/, "");
          });
          event.preventDefault();
          return;
        }
        if (!canCancel) return;
        event.preventDefault();
        aui.composer().cancel();
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey &&
        slashCommandOpen
      ) {
        event.preventDefault();
        const firstCommand = slashCommands[0];
        if (firstCommand !== undefined && !slashCommandsLoading) {
          insertSlashCommand(firstCommand);
        }
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey &&
        skillOpen &&
        !skillsLoading &&
        skills[0] !== undefined
      ) {
        event.preventDefault();
        insertSkill(skills[0]);
        return;
      }

      if (
        (event.key === "Enter" || event.key === "Tab") &&
        !event.shiftKey &&
        fileMentionOpen
      ) {
        event.preventDefault();
        const firstFileResult = fileResults[0];
        if (firstFileResult !== undefined && !fileSearchLoading) {
          selectMentionedFile(firstFileResult);
        }
        return;
      }

      if (event.key === "Enter" && !event.shiftKey && isRunning) {
        event.preventDefault();
      }
    },
    [
      aui,
      canCancel,
      fileMentionOpen,
      fileResults,
      fileSearchLoading,
      insertSkill,
      insertSlashCommand,
      isRunning,
      selectMentionedFile,
      skillOpen,
      skills,
      skillsLoading,
      slashCommandOpen,
      slashCommands,
      slashCommandsLoading,
    ],
  );

  return (
    <PromptInput
      inputGroupClassName={composerInputGroupClassName}
      multiple
      onError={handleAttachmentError}
      onSubmit={handleSubmit}
    >
      {hasFloatingAccessory ? (
        <div className="absolute top-0 left-3 z-30 -translate-y-1/2">
          {floatingAccessory}
        </div>
      ) : null}
      {hasFloatingAccessory ? (
        <div aria-hidden="true" className="order-first h-4 w-full shrink-0" />
      ) : null}

      <ComposerAssistPanel
        fileMentionOpen={fileMentionOpen}
        fileResults={fileResults}
        fileSearchLoading={fileSearchLoading}
        onSelectMentionedFile={selectMentionedFile}
        onSelectSkill={insertSkill}
        onSelectSlashCommand={insertSlashCommand}
        skillCatalogSize={environment.availableSkills.length}
        skillOpen={skillOpen}
        skills={skills}
        skillsLoading={skillsLoading}
        slashCommandCatalogSize={environment.availableCommands.length}
        slashCommandsLoading={slashCommandsLoading}
        slashCommandOpen={slashCommandOpen}
        slashCommands={slashCommands}
      />

      <AssistantComposerHeader
        mentionedFiles={mentionedFiles}
        onRemoveMentionedFile={removeMentionedFile}
      />

      <PromptInputBody>
        <PromptInputTextarea
          className="
            max-h-40 min-h-(--workspace-composer-min-height) px-3.5 py-3
            [font-size:var(--workspace-composer-text-size)]
            leading-(--workspace-composer-line-height)
            placeholder:text-muted-foreground/62
          "
          disabled={isInputDisabled}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          placeholder={t("composer.placeholder")}
          ref={textareaRef}
          rows={2}
          value={draftText}
        />
      </PromptInputBody>

      <AssistantComposerFooter draftText={draftText} />
    </PromptInput>
  );
}

function AssistantComposerHeader({
  mentionedFiles,
  onRemoveMentionedFile,
}: {
  mentionedFiles: ComposerMentionedFile[];
  onRemoveMentionedFile: (id: string) => void;
}) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  const hasQuote = useAuiState((state) => Boolean(state.composer.quote));

  if (
    !hasQuote &&
    attachments.files.length === 0 &&
    mentionedFiles.length === 0
  ) {
    return null;
  }

  return (
    <PromptInputHeader
      className={cn("flex-col items-stretch gap-2 px-3! pt-3! pb-2!")}
    >
      {hasQuote ? (
        <ComposerPrimitive.Quote
          className="
            flex items-start gap-2 rounded-md border border-foreground/8
            bg-muted/30 p-2 text-sm
            dark:border-white/8
          "
        >
          <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <ComposerPrimitive.QuoteText
            className={cn("line-clamp-2 flex-1 text-muted-foreground")}
          />
          <ComposerPrimitive.QuoteDismiss className={iconButtonClass}>
            <X className="size-3.5" />
          </ComposerPrimitive.QuoteDismiss>
        </ComposerPrimitive.Quote>
      ) : null}

      {mentionedFiles.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {mentionedFiles.map((file) => (
            <ChatAttachmentTile
              className="max-w-64"
              contentType={file.relativePath}
              key={file.id}
              name={file.name}
              onRemove={() => onRemoveMentionedFile(file.id)}
              removeLabel={t("composer.removeAttachment", {
                name: file.name,
              })}
              typeLabel={t("common.mention")}
            />
          ))}
        </div>
      ) : null}

      {attachments.files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.files.map((file) => {
            if (!file.mediaType) {
              throw new Error("Composer attachment is missing mediaType.");
            }
            const mediaType = file.mediaType;
            const isImage = mediaType.startsWith("image/");
            const name = file.filename ?? t("common.attachment");

            return (
              <ChatAttachmentTile
                className="max-w-64"
                contentType={mediaType}
                key={file.id}
                name={name}
                onRemove={() => attachments.remove(file.id)}
                previewUrl={isImage ? file.url : undefined}
                removeLabel={t("composer.removeAttachment", { name })}
                typeLabel={isImage ? t("common.image") : t("common.file")}
              />
            );
          })}
        </div>
      ) : null}
    </PromptInputHeader>
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
    <PromptInputFooter
      className="
        flex-wrap px-3! py-2!
      "
    >
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
          icon={<SlidersHorizontal />}
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
              h-8 rounded-md border-foreground/8 bg-background/55 px-3 text-xs
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
            size-8 rounded-full p-0 shadow-none
            focus-visible:ring-0!
            active:translate-y-px
          "
          disabled={isRunning || isEmpty}
          size="sm"
          type="submit"
        >
          <ArrowUp />
          <span className="sr-only">{t("common.send")}</span>
        </Button>
      </div>
    </PromptInputFooter>
  );
}
