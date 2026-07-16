import type {
  Chat,
  ChatCreationLocation,
  ChatHistoryMessage,
  ChatRuntimeConfig,
} from "@angel-engine/daemon-api/chat";
import type { AppendMessage, CompleteAttachment } from "@assistant-ui/react";
import type { TFunction } from "i18next";
import type { PromptInputFile } from "@/components/ai-elements/prompt-input";
import type {
  ComposerMentionedFile,
  ComposerMentionedSkill,
} from "@/features/chat/components/composer/composer-attachments";

import { useCallback, useRef } from "react";
import {
  createCompleteAttachmentFromPromptFile,
  createCompleteMentionAttachment,
  createCompleteSkillMentionAttachment,
} from "@/features/chat/components/composer/composer-attachments";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";

export interface SendChatMessageCallbacks {
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
}

export interface SendChatMessageOptions extends SendChatMessageCallbacks {
  chatId?: string;
  creationLocation?: ChatCreationLocation;
  cwd?: string;
  model?: string;
  mode?: string;
  permissionMode?: string;
  prewarmId?: string;
  projectId?: string | null;
  reasoningEffort?: string;
  runtime?: string;
}

export interface SendPromptMessageInput {
  text: string;
  attachments: PromptInputFile[];
  mentionedFiles: ComposerMentionedFile[];
  selectedSkills: ComposerMentionedSkill[];
  t: TFunction;
}

export function useSendChatMessage(
  slotKey: string,
  options: SendChatMessageOptions,
) {
  const startRun = useChatRunStore((state) => state.startRun);
  const latestOptionsRef = useRef(options);
  latestOptionsRef.current = options;

  const sendAppendMessage = useCallback(
    async (message: AppendMessage) => {
      const runConfig = message.runConfig?.custom;
      const modeOverride =
        typeof runConfig?.mode === "string" ? runConfig.mode : undefined;

      return startRun({
        callbacks: {
          onChatCreated: latestOptionsRef.current.onChatCreated,
          onChatMessagesUpdated: latestOptionsRef.current.onChatMessagesUpdated,
          onChatUpdated: latestOptionsRef.current.onChatUpdated,
        },
        input: {
          chatId: latestOptionsRef.current.chatId,
          creationLocation: latestOptionsRef.current.creationLocation,
          cwd: latestOptionsRef.current.cwd,
          model: latestOptionsRef.current.model,
          mode: modeOverride ?? latestOptionsRef.current.mode,
          permissionMode: latestOptionsRef.current.permissionMode,
          prewarmId: latestOptionsRef.current.prewarmId,
          projectId: latestOptionsRef.current.projectId ?? undefined,
          reasoningEffort: latestOptionsRef.current.reasoningEffort,
          runtime: latestOptionsRef.current.runtime,
        },
        message,
        slotKey,
      });
    },
    [slotKey, startRun],
  );

  const sendPromptMessage = useCallback(
    async (input: SendPromptMessageInput) => {
      const text = input.text.trim();
      const hasContent =
        text.length > 0 ||
        input.attachments.length > 0 ||
        input.mentionedFiles.length > 0 ||
        input.selectedSkills.length > 0;
      if (!hasContent) {
        return false;
      }

      const attachments: CompleteAttachment[] = [];
      for (const file of input.attachments) {
        attachments.push(createCompleteAttachmentFromPromptFile(file, input.t));
      }
      for (const file of input.mentionedFiles) {
        attachments.push(createCompleteMentionAttachment(file));
      }
      for (const skill of input.selectedSkills) {
        attachments.push(createCompleteSkillMentionAttachment(skill));
      }

      const message: AppendMessage = {
        attachments,
        content: text.length > 0 ? [{ text, type: "text" }] : [],
        createdAt: new Date(),
        metadata: { custom: {} },
        parentId: null,
        role: "user",
        runConfig: undefined,
        sourceId: null,
      };

      return sendAppendMessage(message);
    },
    [sendAppendMessage],
  );

  return { sendAppendMessage, sendPromptMessage };
}
