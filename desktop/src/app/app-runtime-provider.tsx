import { useMemo, type ReactNode } from "react";
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  type AttachmentAdapter,
  type CompleteAttachment,
  type FeedbackAdapter,
  type PendingAttachment,
  type SpeechSynthesisAdapter,
} from "@assistant-ui/react";

import { useEngineRuntime } from "@/lib/engine-model-adapter";
import type {
  Chat,
  ChatHistoryMessage,
  ChatRuntimeConfig,
} from "@/shared/chat";

const mockFeedbackAdapter: FeedbackAdapter = {
  submit: () => undefined,
};

export function AppRuntimeProvider({
  chatId,
  children,
  historyMessages,
  historyRevision,
  model,
  mode,
  onChatCreated,
  onChatUpdated,
  prewarmId,
  projectId,
  projectPath,
  reasoningEffort,
  runtime: selectedRuntime,
  runtimeConfig,
  slotKey,
}: {
  chatId?: string;
  children: ReactNode;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  model?: string;
  mode?: string;
  onChatCreated?: (chat: Chat) => void;
  onChatUpdated: (
    chat: Chat,
    messages?: ChatHistoryMessage[],
    config?: ChatRuntimeConfig,
  ) => void;
  prewarmId?: string;
  projectId?: string | null;
  projectPath?: string;
  reasoningEffort?: string;
  runtime?: string;
  runtimeConfig?: ChatRuntimeConfig;
  slotKey: string;
}) {
  const adapters = useMemo(
    () => ({
      attachments: new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new GenericFileAttachmentAdapter(),
      ]),
      feedback: mockFeedbackAdapter,
      speech: createMockSpeechAdapter(),
    }),
    [],
  );

  const assistantRuntime = useEngineRuntime({
    adapters,
    chatId,
    historyMessages,
    historyRevision,
    model,
    mode,
    onChatCreated,
    onChatUpdated,
    prewarmId,
    projectId,
    projectPath,
    reasoningEffort,
    runtime: selectedRuntime,
    runtimeConfig,
    slotKey,
  });

  return (
    <AssistantRuntimeProvider runtime={assistantRuntime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

class GenericFileAttachmentAdapter implements AttachmentAdapter {
  public accept = "*";

  public async add(state: { file: File }): Promise<PendingAttachment> {
    return {
      contentType: fileContentType(state.file),
      file: state.file,
      id: state.file.name,
      name: state.file.name,
      status: { reason: "composer-send", type: "requires-action" },
      type: "file",
    };
  }

  public async send(
    attachment: PendingAttachment,
  ): Promise<CompleteAttachment> {
    const contentType = fileContentType(
      attachment.file,
      attachment.contentType,
    );
    const localPath = getLocalFilePath(attachment.file);
    const content = {
      ...(localPath ? { path: localPath } : {}),
      data: await readFileAsDataUrl(attachment.file),
      filename: attachment.name,
      mimeType: contentType,
      type: "file" as const,
    };

    return {
      ...attachment,
      content: [content] as CompleteAttachment["content"],
      contentType,
      status: { type: "complete" },
      type: "file",
    };
  }

  public async remove() {
    // noop
  }
}

function fileContentType(file: File, fallback?: string) {
  return file.type || fallback || "application/octet-stream";
}

function getLocalFilePath(file: File) {
  if (typeof window === "undefined") return null;
  const path = window.desktopEnvironment?.getPathForFile?.(file);
  return typeof path === "string" && path.trim() ? path.trim() : null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

function createMockSpeechAdapter(): SpeechSynthesisAdapter {
  return {
    speak() {
      const listeners = new Set<() => void>();
      const utterance: SpeechSynthesisAdapter.Utterance = {
        cancel() {
          window.clearTimeout(startTimeout);
          window.clearTimeout(endTimeout);
          utterance.status = { type: "ended", reason: "cancelled" };
          listeners.forEach((listener) => listener());
        },
        status: { type: "starting" },
        subscribe(callback) {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
      };
      const startTimeout = window.setTimeout(() => {
        utterance.status = { type: "running" };
        listeners.forEach((listener) => listener());
      }, 120);
      const endTimeout = window.setTimeout(() => {
        utterance.status = { type: "ended", reason: "finished" };
        listeners.forEach((listener) => listener());
      }, 2200);
      return utterance;
    },
  };
}
