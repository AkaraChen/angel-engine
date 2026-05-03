export type Chat = {
  id: string;
  title: string;
  projectId: string | null;
  cwd: string | null;
  runtime: string;
  remoteThreadId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatCreateInput = {
  cwd?: string;
  projectId?: string | null;
  runtime?: string;
  title?: string;
};

export type ChatHistoryMessage = {
  content: ChatHistoryMessagePart[];
  createdAt?: string;
  id: string;
  role: 'assistant' | 'system' | 'user';
};

export type ChatHistoryMessagePart =
  | {
      text: string;
      type: 'reasoning' | 'text';
    };

export type ChatLoadResult = {
  chat: Chat;
  messages: ChatHistoryMessage[];
};

export type ChatSendInput = {
  chatId?: string;
  cwd?: string;
  projectId?: string | null;
  text: string;
};

export type ChatSendResult = {
  chat: Chat;
  chatId: string;
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
