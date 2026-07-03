import type { AgentValueOption } from "@shared/agents";
import type { ChatAvailableCommand, ChatAvailableSkill } from "@shared/chat";
import type { TFunction } from "i18next";

export interface AttachmentInputError {
  code: "max_files" | "max_file_size" | "accept" | "file_read" | "submit";
  message: string;
}

export function attachmentErrorTitle(
  code: AttachmentInputError["code"],
  t: TFunction,
) {
  switch (code) {
    case "accept":
      return t("composer.fileTypeBlocked");
    case "max_file_size":
      return t("composer.fileTooLarge");
    case "max_files":
      return t("composer.toasts.tooManyFiles");
    case "file_read":
      return t("composer.toasts.couldNotReadFile");
    case "submit":
      return t("composer.toasts.couldNotSendAttachment");
  }
}

export function attachmentErrorMessage(
  code: AttachmentInputError["code"],
  t: TFunction,
) {
  switch (code) {
    case "accept":
      return t("composer.attachmentErrors.accept");
    case "max_file_size":
      return t("composer.attachmentErrors.maxFileSize");
    case "max_files":
      return t("composer.attachmentErrors.maxFiles");
    case "file_read":
      return t("composer.attachmentErrors.fileRead");
    case "submit":
      return t("composer.attachmentErrors.submit");
  }
}

export function slashQueryFromDraft(text: string) {
  const match = /^\/([^\s/]*)$/.exec(text);
  return match ? match[1].toLowerCase() : null;
}

export function filterSlashCommands(
  commands: ChatAvailableCommand[],
  query: string,
) {
  const normalized = query.toLowerCase();
  return commands
    .filter((command) => {
      const name = command.name.toLowerCase();
      return !normalized || name.includes(normalized);
    })
    .slice(0, 8);
}

export function replaceMentionQuery(text: string, relativePath: string) {
  const replacement = `@${relativePath} `;
  if (/(?:^|\s)@[^\s@]*$/.test(text)) {
    return text.replace(
      /(^|\s)@[^\s@]*$/,
      (_match, prefix: string) => `${prefix}${replacement}`,
    );
  }
  const separator = text && !/\s$/.test(text) ? " " : "";
  return `${text}${separator}${replacement}`;
}

const SKILL_QUERY_PATTERN = /(?:^|\s)\$([a-z][a-z0-9-]*)?$/i;

export function skillQueryFromDraft(text: string) {
  const match = SKILL_QUERY_PATTERN.exec(text);
  return match ? (match[1] ?? "").toLowerCase() : null;
}

export function filterSkills(skills: ChatAvailableSkill[], query: string) {
  const normalized = query.toLowerCase();
  return skills
    .filter((skill) => {
      const name = skill.name.toLowerCase();
      return !normalized || name.includes(normalized);
    })
    .slice(0, 8);
}

export function replaceSkillQuery(text: string, skillName: string) {
  const replacement = `$${skillName} `;
  if (SKILL_QUERY_PATTERN.test(text)) {
    return text.replace(
      /(^|\s)\$[a-z0-9-]*$/i,
      (_match, prefix: string) => `${prefix}${replacement}`,
    );
  }
  const separator = text && !/\s$/.test(text) ? " " : "";
  return `${text}${separator}${replacement}`;
}

export function optionLabel(options: AgentValueOption[], value: string) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function filterComposerOptions(
  options: AgentValueOption[],
  query: string,
) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.value.toLowerCase().includes(normalizedQuery),
  );
}

export function shortEffortLabel(
  label: string,
  defaultLabel: string,
  shortDefaultLabel: string,
) {
  return label.toLowerCase() === defaultLabel.toLowerCase()
    ? shortDefaultLabel
    : label;
}

export function composerSettingDisabledReason({
  canSet,
  disabled,
  label,
  optionCount,
  t,
}: {
  canSet: boolean;
  disabled?: boolean;
  label: string;
  optionCount: number;
  t: TFunction;
}) {
  if (disabled) {
    return t("composer.disabledReasons.cannotChangeWhileRunning");
  }
  if (!canSet || optionCount === 0) {
    return t("composer.disabledReasons.cannotAdjust", { label });
  }
  if (optionCount < 2) {
    return t("composer.disabledReasons.onlyOneValue", { label });
  }
  return undefined;
}
