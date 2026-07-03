import type {
  Chat,
  ChatAvailableCommand,
  ChatAvailableSkill,
  ChatCreationLocation,
  ChatHistoryMessage,
  ChatRuntimeConfig,
  ProjectFileSearchResult,
} from "@shared/chat";
import type { Project } from "@shared/projects";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import type {
  PromptInputFile,
  PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import type {
  ComposerMentionedFile,
  ComposerMentionedSkill,
} from "@/features/chat/components/composer/composer-attachments";

import type { AttachmentInputError } from "@/features/chat/components/composer/composer-helpers";
import {
  RiArrowUpLine as ArrowUp,
  RiStopCircleLine as CircleStop,
} from "@remixicon/react";
import is from "@sindresorhus/is";
import { useCallback, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { DraftProjectSelect } from "@/app/workspace/draft-project-select";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
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
  PromptAttachmentButton,
} from "@/features/chat/components/composer/composer-menus";
import { PlanModeToggleButton } from "@/features/chat/components/composer/composer-plan-mode";
import { SketchUnderline } from "@/features/chat/components/sketch-underline";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import { useChatOptions } from "@/features/chat/runtime/chat-options-context";
import { useSendChatMessage } from "@/features/chat/runtime/use-send-chat-message";
import {
  useChatRunIsRunning,
  useChatRunStore,
} from "@/features/chat/state/chat-run-store";
import {
  mentionQueryFromDraft,
  useProjectFileMentionSearch,
} from "@/features/chat/state/use-project-file-mention-search";
import { cn } from "@/platform/utils";

const newChatInputGroupClassName = cn(
  `
    overflow-visible border-0 bg-transparent backdrop-blur-xl
    [&_button]:shadow-none
    [&_button:focus-visible]:border-transparent!
    [&_button:focus-visible]:ring-0!
  `,
);

const newChatHeaderClassName = cn(
  "flex-col items-stretch gap-2 px-3.5! pt-3.5! pb-2!",
);

interface NewChatComposerProps {
  creationLocation?: ChatCreationLocation;
  creationLocationAccessory?: ReactNode;
  model?: string;
  mode?: string;
  onBeforeSubmit?: () => boolean | Promise<boolean>;
  onChatCreated?: (chat: Chat) => void;
  onChatMessagesUpdated?: (
    chatId: string,
    messages: ChatHistoryMessage[],
    config?: ChatRuntimeConfig,
  ) => void;
  onChatUpdated?: (
    chat: Chat,
    messages?: ChatHistoryMessage[],
    config?: ChatRuntimeConfig,
  ) => void;
  onCreateProject: () => Project | undefined | Promise<Project | undefined>;
  onProjectChange: (projectId: string | null) => void;
  permissionMode?: string;
  prewarmId?: string;
  projectId?: string;
  projectName?: string;
  projects: Project[];
  reasoningEffort?: string;
  runtime: string;
  slotKey: string;
}

export function NewChatComposer({
  creationLocation,
  creationLocationAccessory,
  model,
  mode,
  onBeforeSubmit,
  onChatCreated,
  onChatMessagesUpdated,
  onChatUpdated,
  onCreateProject,
  onProjectChange,
  permissionMode,
  prewarmId,
  projectId,
  projectName,
  projects,
  reasoningEffort,
  runtime,
  slotKey,
}: NewChatComposerProps) {
  const { t } = useTranslation();
  const environment = useChatEnvironment();
  const toast = useToast();
  const isRunning = useChatRunIsRunning(slotKey);
  const cancelRun = useChatRunStore((state) => state.cancelRun);
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  const sendChatMessage = useSendChatMessage(slotKey, {
    chatId: undefined,
    creationLocation,
    model,
    mode,
    onChatCreated,
    onChatMessagesUpdated,
    onChatUpdated,
    permissionMode,
    prewarmId,
    projectId: projectId ?? null,
    reasoningEffort,
    runtime,
  });

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

      await sendChatMessage.sendPromptMessage({
        attachments: message.files as PromptInputFile[],
        mentionedFiles,
        selectedSkills,
        t,
        text,
      });

      setDraftText("");
      setMentionedFiles([]);
      setSelectedSkills([]);
    },
    [mentionedFiles, onBeforeSubmit, selectedSkills, sendChatMessage, t],
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
        if (!isRunning) return;
        event.preventDefault();
        cancelRun(slotKey);
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
      cancelRun,
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
      slotKey,
    ],
  );

  return (
    <div
      className="
        flex h-full flex-col items-center justify-center overflow-y-auto p-4
        sm:px-7
      "
    >
      <div className="w-full max-w-3xl">
        <div className="mb-12 text-center">
          <h2
            className="
              text-(length:--workspace-new-chat-title-size)/tight font-semibold
              text-pretty text-foreground
            "
          >
            {is.nonEmptyString(projectName) ? (
              <Trans
                components={{ project: <SketchUnderline /> }}
                i18nKey="thread.empty.titleWithProject"
                values={{ projectName }}
              />
            ) : (
              t("thread.empty.title")
            )}
          </h2>
          <p
            className="
              mx-auto mt-2 max-w-120
              text-(length:--workspace-new-chat-description-size)/6
              text-muted-foreground
            "
          >
            {t("thread.empty.description")}
          </p>
        </div>

        <div
          className="
            overflow-hidden rounded-2xl border border-foreground/8
            bg-background/86
            dark:border-white/9 dark:bg-card/82
          "
        >
          <PromptInput
            inputGroupClassName={newChatInputGroupClassName}
            multiple
            onError={handleAttachmentError}
            onSubmit={handleSubmit}
          >
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
              slashCommands={slashCommands}
              slashCommandsLoading={slashCommandsLoading}
              slashCommandOpen={slashCommandOpen}
            />

            <NewChatComposerHeader
              mentionedFiles={mentionedFiles}
              onRemoveMentionedFile={removeMentionedFile}
            />

            <PromptInputBody>
              <PromptInputTextarea
                className="
                  max-h-40 min-h-(--workspace-composer-min-height) resize-none
                  px-3.5 py-3 [font-size:var(--workspace-composer-text-size)]
                  leading-(--workspace-composer-line-height)
                  placeholder:text-muted-foreground/55
                "
                disabled={isRunning}
                onChange={handleTextChange}
                onKeyDown={handleTextKeyDown}
                placeholder={t("composer.placeholder")}
                ref={textareaRef}
                rows={3}
                value={draftText}
              />
            </PromptInputBody>

            <NewChatComposerFooter
              draftText={draftText}
              isRunning={isRunning}
              onCancel={() => cancelRun(slotKey)}
            />
          </PromptInput>

          {workspaceMode === "work" && (
            <div
              className="
                flex items-center justify-start gap-2 border-t
                border-foreground/8 bg-muted/30 px-3 py-2
                dark:border-white/9 dark:bg-white/3
              "
            >
              <DraftProjectSelect
                onCreateProject={onCreateProject}
                onProjectChange={onProjectChange}
                projects={projects}
                selectedProjectId={projectId}
                variant="ghost"
              />
              {creationLocationAccessory}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NewChatComposerHeader({
  mentionedFiles,
  onRemoveMentionedFile,
}: {
  mentionedFiles: ComposerMentionedFile[];
  onRemoveMentionedFile: (id: string) => void;
}) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0 && mentionedFiles.length === 0) {
    return null;
  }

  return (
    <PromptInputHeader className={newChatHeaderClassName}>
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

function NewChatComposerFooter({
  draftText,
  isRunning,
  onCancel,
}: {
  draftText: string;
  isRunning: boolean;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const chatOptions = useChatOptions();
  const attachments = usePromptInputAttachments();
  const isEmpty = draftText.length === 0 && attachments.files.length === 0;

  return (
    <PromptInputFooter className="flex-wrap gap-2 border-t-0 px-3.5! py-2.5! shadow-none">
      <PromptInputTools className="flex-wrap">
        <PromptAttachmentButton />
        <ComposerModelMenu disabled={isRunning} options={chatOptions} />
      </PromptInputTools>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <PlanModeToggleButton disabled={isRunning} options={chatOptions} />
        {isRunning ? (
          <Button
            className="
              h-8 rounded-md border-foreground/8 bg-background/55 px-3 text-xs
              focus-visible:ring-0!
              dark:bg-card/60
            "
            onClick={onCancel}
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
