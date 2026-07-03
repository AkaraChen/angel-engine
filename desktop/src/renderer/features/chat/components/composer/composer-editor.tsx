import type {
  ChatAvailableCommand,
  ChatAvailableSkill,
  ProjectFileSearchResult,
} from "@shared/chat";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import type { ComposerMentionedFile } from "@/features/chat/components/composer/composer-attachments";
import type { ComposerEditorController } from "@/features/chat/components/composer/use-composer-editor";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  PromptInputBody,
  PromptInputHeader,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { ChatAttachmentTile } from "@/features/chat/components/attachment-tile";
import { ComposerAssistPanel } from "@/features/chat/components/composer/composer-assist-panel";
import {
  filterSkills,
  filterSlashCommands,
  replaceMentionQuery,
  replaceSkillQuery,
  skillQueryFromDraft,
  slashQueryFromDraft,
} from "@/features/chat/components/composer/composer-helpers";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import {
  mentionQueryFromDraft,
  useProjectFileMentionSearch,
} from "@/features/chat/state/use-project-file-mention-search";

export interface ComposerEditorProps {
  blockSubmit?: boolean;
  canCancel?: boolean;
  controller: ComposerEditorController;
  disabled?: boolean;
  headerClassName?: string;
  headerLeading?: ReactNode;
  onCancel?: () => void;
  rows?: number;
  textareaClassName?: string;
}

export function ComposerEditor({
  blockSubmit = false,
  canCancel = false,
  controller,
  disabled,
  headerClassName,
  headerLeading,
  onCancel,
  rows = 2,
  textareaClassName,
}: ComposerEditorProps) {
  const { t } = useTranslation();
  const environment = useChatEnvironment();
  const {
    draftText,
    mentionedFiles,
    setDraftText,
    setMentionedFiles,
    setSelectedSkills,
    textareaRef,
  } = controller;

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
  const slashQuery = slashQueryFromDraft(draftText);
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

  const handleTextChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      setDraftText(event.currentTarget.value);
    },
    [setDraftText],
  );

  const insertSlashCommand = useCallback(
    (command?: ChatAvailableCommand) => {
      if (!command) return;
      setDraftText((current) => {
        const next = current.replace(/^\/\S*/, `/${command.name}`);
        return `${next.trimEnd()} `;
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [setDraftText, textareaRef],
  );

  const insertSkill = useCallback(
    (skill?: ChatAvailableSkill) => {
      if (!skill) return;
      setSelectedSkills((current) => {
        if (current.some((item) => item.path === skill.path)) return current;
        return [...current, { ...skill, id: skill.path }];
      });
      setDraftText((current) => replaceSkillQuery(current, skill.name));
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [setDraftText, setSelectedSkills, textareaRef],
  );

  const selectMentionedFile = useCallback(
    (file: ProjectFileSearchResult) => {
      setMentionedFiles((current) => {
        if (current.some((item) => item.path === file.path)) return current;
        return [...current, { ...file, id: file.path }];
      });
      setDraftText((current) =>
        replaceMentionQuery(current, file.relativePath),
      );
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    [setDraftText, setMentionedFiles, textareaRef],
  );

  const removeMentionedFile = useCallback(
    (id: string) => {
      setMentionedFiles((current) => current.filter((file) => file.id !== id));
    },
    [setMentionedFiles],
  );

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
        if (!canCancel || onCancel === undefined) return;
        event.preventDefault();
        onCancel();
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

      if (event.key === "Enter" && !event.shiftKey && blockSubmit) {
        event.preventDefault();
      }
    },
    [
      blockSubmit,
      canCancel,
      fileMentionOpen,
      fileResults,
      fileSearchLoading,
      insertSkill,
      insertSlashCommand,
      onCancel,
      selectMentionedFile,
      setDraftText,
      skillOpen,
      skills,
      skillsLoading,
      slashCommandOpen,
      slashCommands,
      slashCommandsLoading,
    ],
  );

  return (
    <>
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

      <ComposerEditorHeader
        headerClassName={headerClassName}
        headerLeading={headerLeading}
        mentionedFiles={mentionedFiles}
        onRemoveMentionedFile={removeMentionedFile}
      />

      <PromptInputBody>
        <PromptInputTextarea
          className={textareaClassName}
          disabled={disabled}
          onChange={handleTextChange}
          onKeyDown={handleTextKeyDown}
          placeholder={t("composer.placeholder")}
          ref={textareaRef}
          rows={rows}
          value={draftText}
        />
      </PromptInputBody>
    </>
  );
}

function ComposerEditorHeader({
  headerClassName,
  headerLeading,
  mentionedFiles,
  onRemoveMentionedFile,
}: {
  headerClassName?: string;
  headerLeading?: ReactNode;
  mentionedFiles: ComposerMentionedFile[];
  onRemoveMentionedFile: (id: string) => void;
}) {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  const hasHeaderLeading =
    headerLeading !== null && headerLeading !== undefined;

  if (
    !hasHeaderLeading &&
    attachments.files.length === 0 &&
    mentionedFiles.length === 0
  ) {
    return null;
  }

  return (
    <PromptInputHeader className={headerClassName}>
      {headerLeading}

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
