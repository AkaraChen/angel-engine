import type {
  ChatAvailableCommand,
  ChatAvailableSkill,
  ProjectFileSearchResult,
} from "@shared/chat";
import type { ReactNode } from "react";
import { SpinnerGap as Loader2 } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { nativeControlRowClass } from "@/features/chat/components/thread-styles";
import { cn } from "@/platform/utils";

export interface ComposerAssistPanelProps {
  fileMentionOpen: boolean;
  fileResults: ProjectFileSearchResult[];
  fileSearchLoading: boolean;
  onSelectMentionedFile: (file: ProjectFileSearchResult) => void;
  onSelectSkill: (skill: ChatAvailableSkill) => void;
  onSelectSlashCommand: (command: ChatAvailableCommand) => void;
  skillCatalogSize: number;
  skillOpen: boolean;
  skills: ChatAvailableSkill[];
  skillsLoading: boolean;
  slashCommandCatalogSize: number;
  slashCommands: ChatAvailableCommand[];
  slashCommandsLoading: boolean;
  slashCommandOpen: boolean;
}

export interface AssistPanelFrameProps {
  children: ReactNode;
  title: string;
}

export interface SlashCommandAssistPanelProps {
  catalogSize: number;
  commands: ChatAvailableCommand[];
  loading: boolean;
  onSelect: (command: ChatAvailableCommand) => void;
}

export interface FileMentionAssistPanelProps {
  files: ProjectFileSearchResult[];
  loading: boolean;
  onSelect: (file: ProjectFileSearchResult) => void;
}

export interface SkillAssistPanelProps {
  catalogSize: number;
  loading: boolean;
  onSelect: (skill: ChatAvailableSkill) => void;
  skills: ChatAvailableSkill[];
}

export function ComposerAssistPanel({
  fileMentionOpen,
  fileResults,
  fileSearchLoading,
  onSelectMentionedFile,
  onSelectSkill,
  onSelectSlashCommand,
  skillCatalogSize,
  skillOpen,
  skills,
  skillsLoading,
  slashCommandCatalogSize,
  slashCommandsLoading,
  slashCommandOpen,
  slashCommands,
}: ComposerAssistPanelProps) {
  if (slashCommandOpen) {
    return (
      <SlashCommandAssistPanel
        catalogSize={slashCommandCatalogSize}
        commands={slashCommands}
        loading={slashCommandsLoading}
        onSelect={onSelectSlashCommand}
      />
    );
  }

  if (skillOpen) {
    return (
      <SkillAssistPanel
        catalogSize={skillCatalogSize}
        loading={skillsLoading}
        onSelect={onSelectSkill}
        skills={skills}
      />
    );
  }

  if (fileMentionOpen) {
    return (
      <FileMentionAssistPanel
        files={fileResults}
        loading={fileSearchLoading}
        onSelect={onSelectMentionedFile}
      />
    );
  }

  return null;
}

export function AssistPanelFrame({ children, title }: AssistPanelFrameProps) {
  return (
    <div
      className="
        absolute inset-x-0 bottom-full z-50 mb-2 overflow-hidden rounded-lg
        border border-border-subtle bg-popover/96 p-1 text-popover-foreground
        shadow-[0_12px_30px_-24px_rgba(0,0,0,0.62)] backdrop-blur-xl
      "
    >
      <div
        className="
          px-2 py-1 text-[11px] font-medium text-muted-foreground select-none
        "
      >
        {title}
      </div>
      <div className="max-h-48 overflow-y-auto">{children}</div>
    </div>
  );
}

export function SlashCommandAssistPanel({
  catalogSize,
  commands,
  loading,
  onSelect,
}: SlashCommandAssistPanelProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <AssistPanelFrame title={t("composer.commands")}>
        <div
          className={cn(
            "flex items-center gap-2 p-2 text-sm text-muted-foreground",
          )}
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span>{t("composer.loadingCommands")}</span>
        </div>
      </AssistPanelFrame>
    );
  }

  if (commands.length === 0) {
    const emptyMessage =
      catalogSize === 0
        ? t("composer.noCommandsAdvertised")
        : t("composer.noMatchingCommands");

    return (
      <AssistPanelFrame title={t("composer.commands")}>
        <div className="p-2 text-sm text-muted-foreground">{emptyMessage}</div>
      </AssistPanelFrame>
    );
  }

  return (
    <AssistPanelFrame title={t("composer.commands")}>
      {commands.map((command) => {
        const inputHint = command.inputHint;
        return (
          <button
            className={cn(
              nativeControlRowClass,
              `
                flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left
                text-sm
              `,
            )}
            key={command.name}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(command)}
            type="button"
          >
            <span className="shrink-0 font-mono text-xs text-primary">
              /{command.name}
            </span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {command.description}
            </span>
            {inputHint !== null &&
            inputHint !== undefined &&
            inputHint.length > 0 ? (
              <span
                className="
                  hidden shrink-0 truncate text-xs text-muted-foreground
                  sm:inline
                "
              >
                {inputHint}
              </span>
            ) : null}
          </button>
        );
      })}
    </AssistPanelFrame>
  );
}

export function SkillAssistPanel({
  catalogSize,
  loading,
  onSelect,
  skills,
}: SkillAssistPanelProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <AssistPanelFrame title={t("composer.skills")}>
        <div
          className={cn(
            "flex items-center gap-2 p-2 text-sm text-muted-foreground",
          )}
        >
          <Loader2 className="size-3.5 animate-spin" />
          <span>{t("composer.loadingSkills")}</span>
        </div>
      </AssistPanelFrame>
    );
  }

  if (skills.length === 0) {
    const emptyMessage =
      catalogSize === 0
        ? t("composer.noSkillsAdvertised")
        : t("composer.noMatchingSkills");

    return (
      <AssistPanelFrame title={t("composer.skills")}>
        <div className="p-2 text-sm text-muted-foreground">{emptyMessage}</div>
      </AssistPanelFrame>
    );
  }

  return (
    <AssistPanelFrame title={t("composer.skills")}>
      {skills.map((skill) => (
        <button
          className={cn(
            nativeControlRowClass,
            `
              flex w-full min-w-0 items-center gap-2 px-2 py-1.5 text-left
              text-sm
            `,
          )}
          key={skill.path}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(skill)}
          type="button"
        >
          <span className="shrink-0 font-mono text-xs text-primary">
            {`$${skill.name}`}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {skill.description}
          </span>
        </button>
      ))}
    </AssistPanelFrame>
  );
}

export function FileMentionAssistPanel({
  files,
  loading,
  onSelect,
}: FileMentionAssistPanelProps) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <AssistPanelFrame title={t("composer.files")}>
        <div className="p-2 text-sm text-muted-foreground">
          {t("common.searching")}
        </div>
      </AssistPanelFrame>
    );
  }

  if (files.length === 0) {
    return (
      <AssistPanelFrame title={t("composer.files")}>
        <div className="p-2 text-sm text-muted-foreground">
          {t("composer.noFilesFound")}
        </div>
      </AssistPanelFrame>
    );
  }

  return (
    <AssistPanelFrame title={t("composer.files")}>
      {files.map((file) => (
        <button
          className={cn(
            nativeControlRowClass,
            "flex w-full min-w-0 flex-col px-2 py-1.5 text-left",
          )}
          key={file.path}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(file)}
          type="button"
        >
          <span className="truncate text-sm">{file.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {file.relativePath}
          </span>
        </button>
      ))}
    </AssistPanelFrame>
  );
}
