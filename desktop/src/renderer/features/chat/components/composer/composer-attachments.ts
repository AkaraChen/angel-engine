import type {
  ChatAvailableSkill,
  ProjectFileSearchResult,
} from "@angel-engine/daemon-api/chat";
import type { CompleteAttachment, CreateAttachment } from "@assistant-ui/react";
import type { TFunction } from "i18next";
import type {
  PromptInputFile,
  PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

export type ComposerMentionedFile = ProjectFileSearchResult & {
  id: string;
};

export type ComposerMentionedSkill = ChatAvailableSkill & {
  id: string;
};

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

export function promptFilePath(file: PromptInputMessage["files"][number]) {
  const path = file.path;
  return typeof path === "string" && path ? path : undefined;
}
