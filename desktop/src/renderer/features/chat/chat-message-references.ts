import type {
  ChatAttachmentInput,
  ChatAvailableSkill,
  ProjectFileSearchResult,
} from "@angel-engine/daemon-api/chat";
import type { AppendMessage } from "@assistant-ui/react";

import { normalizeChatAttachmentsInput } from "@angel-engine/daemon-api/chat";

const CHAT_MESSAGE_REFERENCES_KEY = "chatMessageReferences";

type ChatMessageReference = Extract<
  ChatAttachmentInput,
  { type: "fileMention" | "skillMention" }
>;
type ChatRunConfig = NonNullable<AppendMessage["runConfig"]>;

export function chatMessageReferences(
  files: ProjectFileSearchResult[],
  skills: ChatAvailableSkill[],
): ChatMessageReference[] {
  return [
    ...files.map(
      (file): ChatMessageReference => ({
        mimeType: file.mimeType,
        name: file.name,
        path: file.path,
        type: "fileMention",
      }),
    ),
    ...skills.map(
      (skill): ChatMessageReference => ({
        name: skill.name,
        path: skill.path,
        type: "skillMention",
      }),
    ),
  ];
}

export function runConfigWithChatMessageReferences(
  runConfig: ChatRunConfig | undefined,
  references: ChatMessageReference[],
): ChatRunConfig | undefined {
  const custom = { ...runConfig?.custom };
  if (references.length === 0) {
    delete custom[CHAT_MESSAGE_REFERENCES_KEY];
    if (runConfig === undefined && Object.keys(custom).length === 0) {
      return undefined;
    }
  } else {
    custom[CHAT_MESSAGE_REFERENCES_KEY] = references;
  }
  return {
    ...runConfig,
    custom,
  };
}

export function chatMessageReferencesFromRunConfig(
  runConfig: ChatRunConfig | undefined,
): ChatMessageReference[] {
  const value = runConfig?.custom?.[CHAT_MESSAGE_REFERENCES_KEY];
  if (value === undefined) return [];
  return normalizeChatAttachmentsInput(value).filter(
    (input): input is ChatMessageReference =>
      input.type === "fileMention" || input.type === "skillMention",
  );
}
