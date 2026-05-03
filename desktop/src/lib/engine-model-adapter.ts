import type {
  ChatModelAdapter,
  ChatModelRunResult,
} from '@assistant-ui/react';

import { streamChatEvents } from '@/lib/chat-stream';
import type { ChatSendResult, ChatStreamEvent } from '@/shared/chat';

type RuntimeMessage = {
  content: readonly unknown[];
  role: string;
};

export function createEngineModelAdapter(projectPath?: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const prompt = getLastUserText(messages);
      if (!prompt) return;

      const run = new ChatRunAccumulator();
      yield run.toModelResult();

      for await (const event of streamChatEvents(
        { cwd: projectPath, text: prompt },
        abortSignal
      )) {
        if (event.type === 'done') break;

        run.accept(event);
        yield run.toModelResult();

        if (event.type === 'error') break;
      }
    },
  };
}

class ChatRunAccumulator {
  private readonly startedAt = Date.now();
  private chunkCount = 0;
  private reasoning = '';
  private result: ChatSendResult | undefined;
  private text = '';

  accept(event: Exclude<ChatStreamEvent, { type: 'done' }>) {
    if (event.type === 'delta') {
      this.chunkCount += 1;
      if (event.part === 'reasoning') {
        this.reasoning += event.text;
      } else {
        this.text += event.text;
      }
      return;
    }

    if (event.type === 'result') {
      this.result = event.result;
      this.reasoning = event.result.reasoning || this.reasoning;
      this.text = event.result.text || this.text;
      return;
    }

    this.text = `Backend chat failed: ${event.message}`;
  }

  toModelResult(): ChatModelRunResult {
    return {
      content: [
        ...(this.reasoning.trim()
          ? [{ type: 'reasoning' as const, text: this.reasoning }]
          : []),
        { type: 'text' as const, text: this.text },
      ],
      metadata: {
        custom: {
          model: this.result?.model ?? 'angel-engine-client',
          turnId: this.result?.turnId,
        },
        timing: {
          streamStartTime: this.startedAt,
          tokenCount: Math.max(1, Math.round(this.text.length / 4)),
          toolCallCount: 0,
          totalChunks: Math.max(1, this.chunkCount),
          totalStreamTime: Date.now() - this.startedAt,
        },
      },
    };
  }
}

function getLastUserText(messages: readonly RuntimeMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') continue;

    const text = message.content
      .map((part) => (isTextPart(part) ? String(part.text) : ''))
      .join('\n')
      .trim();

    if (text) return text;
  }

  return '';
}

function isTextPart(part: unknown): part is { text: unknown; type: 'text' } {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'text' &&
    'text' in part
  );
}
