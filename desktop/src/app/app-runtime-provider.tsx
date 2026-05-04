import { useMemo, type ReactNode } from 'react';
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  type FeedbackAdapter,
  type SpeechSynthesisAdapter,
} from '@assistant-ui/react';

import { useEngineRuntime } from '@/lib/engine-model-adapter';
import type { Chat, ChatHistoryMessage } from '@/shared/chat';

const mockFeedbackAdapter: FeedbackAdapter = {
  submit: () => undefined,
};

export function AppRuntimeProvider({
  chatId,
  children,
  historyMessages,
  historyRevision,
  onChatUpdated,
  projectId,
  projectPath,
}: {
  chatId?: string;
  children: ReactNode;
  historyMessages: ChatHistoryMessage[];
  historyRevision: number;
  onChatUpdated: (chat: Chat, messages?: ChatHistoryMessage[]) => void;
  projectId?: string | null;
  projectPath?: string;
}) {
  const adapters = useMemo(
    () => ({
      attachments: new CompositeAttachmentAdapter([
        new SimpleImageAttachmentAdapter(),
        new SimpleTextAttachmentAdapter(),
      ]),
      feedback: mockFeedbackAdapter,
      speech: createMockSpeechAdapter(),
    }),
    []
  );

  const runtime = useEngineRuntime({
    adapters,
    chatId,
    historyMessages,
    historyRevision,
    onChatUpdated,
    projectId,
    projectPath,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}

function createMockSpeechAdapter(): SpeechSynthesisAdapter {
  return {
    speak() {
      const listeners = new Set<() => void>();
      const utterance: SpeechSynthesisAdapter.Utterance = {
        cancel() {
          window.clearTimeout(startTimeout);
          window.clearTimeout(endTimeout);
          utterance.status = { type: 'ended', reason: 'cancelled' };
          listeners.forEach((listener) => listener());
        },
        status: { type: 'starting' },
        subscribe(callback) {
          listeners.add(callback);
          return () => listeners.delete(callback);
        },
      };
      const startTimeout = window.setTimeout(() => {
        utterance.status = { type: 'running' };
        listeners.forEach((listener) => listener());
      }, 120);
      const endTimeout = window.setTimeout(() => {
        utterance.status = { type: 'ended', reason: 'finished' };
        listeners.forEach((listener) => listener());
      }, 2200);
      return utterance;
    },
  };
}
