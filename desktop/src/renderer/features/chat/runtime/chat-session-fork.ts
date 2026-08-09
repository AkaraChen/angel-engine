import type { ChatHistoryMessage } from "@angel-engine/daemon-api/chat";
import type { AppendMessage, CompleteAttachment } from "@assistant-ui/react";

const FORK_ATTACHMENT_MIME_TYPE = "application/json";

export function createForkSessionMessage(
  messages: ChatHistoryMessage[],
  messageId: string,
  sourceChatId: string,
): AppendMessage {
  const forkedMessages = messagesThrough(messages, messageId);
  const filename = `angel-session-${sourceChatId}-${messageId}.json`;
  const transcript = JSON.stringify(
    {
      forkedAtMessageId: messageId,
      messages: forkedMessages,
      sourceChatId,
      version: 1,
    },
    null,
    2,
  );
  const attachment: CompleteAttachment = {
    content: [
      {
        data: utf8ToBase64(transcript),
        filename,
        mimeType: FORK_ATTACHMENT_MIME_TYPE,
        type: "file",
      },
    ],
    contentType: FORK_ATTACHMENT_MIME_TYPE,
    id: `fork-${messageId}`,
    name: filename,
    status: { type: "complete" },
    type: "file",
  };

  return {
    attachments: [attachment],
    content: [
      {
        text: "Continue this conversation from the attached message history.",
        type: "text",
      },
    ],
    createdAt: new Date(),
    metadata: { custom: {} },
    parentId: null,
    role: "user",
    runConfig: undefined,
    sourceId: null,
  };
}

export function messagesThrough(
  messages: ChatHistoryMessage[],
  messageId: string,
) {
  const messageIndex = messages.findIndex(
    (message) => message.id === messageId,
  );
  if (messageIndex < 0) {
    throw new Error(`Cannot fork from missing message: ${messageId}`);
  }
  return messages.slice(0, messageIndex + 1);
}

function utf8ToBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
