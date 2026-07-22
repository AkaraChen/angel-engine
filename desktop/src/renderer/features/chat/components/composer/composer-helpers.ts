import type { AgentValueOption } from "@angel-engine/daemon-api/agents";
import type {
  ChatAvailableCommand,
  ChatAvailableSkill,
} from "@angel-engine/daemon-api/chat";
import type { TFunction } from "i18next";

export interface AttachmentInputError {
  code: "max_files" | "max_file_size" | "accept" | "file_read" | "submit";
  message: string;
}

export function appendPasteSourceUrls(text: string, sourceUrls: string[]) {
  if (sourceUrls.length === 0 || text.trim().length === 0) {
    return text;
  }

  const sourceLines = sourceUrls.map(
    (sourceUrl) => `(Pasted from ${sourceUrl})`,
  );
  return `${text}\n\n${sourceLines.join("\n")}`;
}

export function pasteSourceUrlPath(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  return `${url.pathname}${url.search}${url.hash}`;
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
      return t("composer.toasts.couldNotSendMessage");
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

export function filterSkills(skills: ChatAvailableSkill[], query: string) {
  const normalized = query.toLowerCase();
  return skills
    .filter((skill) => {
      const name = skill.name.toLowerCase();
      return !normalized || name.includes(normalized);
    })
    .slice(0, 8);
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
