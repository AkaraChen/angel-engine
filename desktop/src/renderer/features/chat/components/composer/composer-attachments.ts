import type { CompleteAttachment, CreateAttachment } from "@assistant-ui/react";
import type { ChatAvailableSkill, ProjectFileSearchResult } from "@shared/chat";
import type { TFunction } from "i18next";
import type {
  PromptInputFile,
  PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import is from "@sindresorhus/is";

export type ComposerMentionedFile = ProjectFileSearchResult & {
  id: string;
};

export type ComposerMentionedSkill = ChatAvailableSkill & {
  id: string;
};

const SKILL_MENTION_MIME_TYPE = "application/vnd.angel-engine.skill-mention";

export function createAttachmentFromPromptFile(
  file: PromptInputMessage["files"][number],
  t: TFunction,
): CreateAttachment {
  const filename = file.filename ?? t("common.attachment");
  if (!file.mediaType) {
    throw new Error(t("composer.couldNotReadAttachment", { filename }));
  }
  if (!file.url) {
    throw new Error(t("composer.couldNotReadAttachment", { filename }));
  }
  const mediaType = file.mediaType;
  const url = file.url;
  const path = promptFilePath(file);
  const isImage = mediaType.startsWith("image/");

  if (url === undefined || url.length === 0 || url.startsWith("blob:")) {
    throw new Error(t("composer.couldNotReadAttachment", { filename }));
  }

  const content = isImage
    ? {
        ...(path !== undefined ? { path } : {}),
        filename,
        image: url,
        type: "image" as const,
      }
    : {
        ...(path !== undefined ? { path } : {}),
        data: url,
        filename,
        mimeType: mediaType,
        type: "file" as const,
      };

  return {
    content: [content] as CreateAttachment["content"],
    contentType: mediaType,
    name: filename,
    type: isImage ? "image" : "file",
  };
}

export function createCompleteAttachmentFromPromptFile(
  file: PromptInputFile,
  t: TFunction,
): CompleteAttachment {
  const filename = file.filename ?? t("common.attachment");
  if (!file.mediaType) {
    throw new Error(t("composer.couldNotReadAttachment", { filename }));
  }
  if (!file.url) {
    throw new Error(t("composer.couldNotReadAttachment", { filename }));
  }
  const mediaType = file.mediaType;
  const url = file.url;
  const path = promptFilePath(file);
  const isImage = mediaType.startsWith("image/");

  if (url === undefined || url.length === 0 || url.startsWith("blob:")) {
    throw new Error(t("composer.couldNotReadAttachment", { filename }));
  }

  const content = isImage
    ? {
        ...(path !== undefined ? { path } : {}),
        filename,
        image: url,
        type: "image" as const,
      }
    : {
        ...(path !== undefined ? { path } : {}),
        data: url,
        filename,
        mimeType: mediaType,
        type: "file" as const,
      };

  return {
    content: [content] as CompleteAttachment["content"],
    contentType: mediaType,
    id: file.id,
    name: filename,
    status: { type: "complete" },
    type: isImage ? "image" : "file",
  };
}

export function createMentionAttachment(
  file: ComposerMentionedFile,
): CreateAttachment {
  const mimeType = file.mimeType;
  if (!is.nonEmptyString(mimeType)) {
    throw new Error(
      `Mentioned file is missing MIME type: ${file.relativePath}`,
    );
  }
  const content = {
    data: file.path,
    filename: file.name,
    mention: true,
    mimeType,
    path: file.path,
    type: "file" as const,
  };
  return {
    content: [content],
    contentType: mimeType,
    name: file.name,
    type: "file",
  };
}

export function createCompleteMentionAttachment(
  file: ComposerMentionedFile,
): CompleteAttachment {
  const mimeType = file.mimeType;
  if (!is.nonEmptyString(mimeType)) {
    throw new Error(
      `Mentioned file is missing MIME type: ${file.relativePath}`,
    );
  }
  const content = {
    data: file.path,
    filename: file.name,
    mention: true,
    mimeType,
    path: file.path,
    type: "file" as const,
  };
  return {
    content: [content],
    contentType: mimeType,
    id: file.id,
    name: file.name,
    status: { type: "complete" },
    type: "file",
  };
}

export function createSkillMentionAttachment(
  skill: ComposerMentionedSkill,
): CreateAttachment {
  const content = {
    data: skill.path,
    filename: skill.name,
    mimeType: SKILL_MENTION_MIME_TYPE,
    path: skill.path,
    skill: true,
    type: "file" as const,
  };
  return {
    content: [content],
    contentType: SKILL_MENTION_MIME_TYPE,
    name: skill.name,
    type: "file",
  };
}

export function createCompleteSkillMentionAttachment(
  skill: ComposerMentionedSkill,
): CompleteAttachment {
  const content = {
    data: skill.path,
    filename: skill.name,
    mimeType: SKILL_MENTION_MIME_TYPE,
    path: skill.path,
    skill: true,
    type: "file" as const,
  };
  return {
    content: [content],
    contentType: SKILL_MENTION_MIME_TYPE,
    id: skill.id,
    name: skill.name,
    status: { type: "complete" },
    type: "file",
  };
}

export function promptFilePath(file: PromptInputMessage["files"][number]) {
  const path = file.path;
  return typeof path === "string" && path ? path : undefined;
}
