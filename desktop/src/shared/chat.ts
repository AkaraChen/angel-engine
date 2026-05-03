export type ChatSendInput = {
  cwd?: string;
  text: string;
};

export type ChatSendResult = {
  model?: string;
  reasoning?: string;
  text: string;
  turnId?: string;
};

export type ChatStreamPart = 'reasoning' | 'text';

export type ChatStreamDelta = {
  part: ChatStreamPart;
  text: string;
  turnId?: string;
  type: 'delta';
};

export type ChatStreamEvent =
  | ChatStreamDelta
  | {
      result: ChatSendResult;
      type: 'result';
    }
  | {
      message: string;
      type: 'error';
    }
  | {
      type: 'done';
    };

export type ChatStreamStartInput = {
  input: ChatSendInput;
  streamId: string;
};

export type ChatStreamApi = {
  send(
    input: ChatSendInput,
    onEvent: (streamEvent: ChatStreamEvent) => void
  ): () => void;
};

export const CHAT_STREAM_CANCEL_CHANNEL = 'chat:stream:cancel';
export const CHAT_STREAM_START_CHANNEL = 'chat:stream:start';

export function chatStreamEventChannel(streamId: string) {
  return `chat:stream:event:${streamId}`;
}
