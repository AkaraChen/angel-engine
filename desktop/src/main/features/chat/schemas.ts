import { type } from "arktype";

// Stream IPC schemas
export const elicitationAnswer = type({
  id: "string > 0",
  value: "string > 0",
});

export const elicitationResponse = type({
  type: "'allow' | 'allowForSession' | 'deny' | 'cancel' | 'externalComplete' | 'answers' | 'dynamicToolResult' | 'raw'",
  "answers?": elicitationAnswer.array(),
  "success?": "boolean",
  "value?": "string > 0",
});

export const chatStreamStartInput = type({
  input: {
    attachments: "unknown",
    "chatId?": "string",
    "cwd?": "string",
    "model?": "string",
    "mode?": "string",
    "prewarmId?": "string",
    "projectId?": "string",
    "reasoningEffort?": "string",
    "runtime?": "string",
    text: "string > 0",
  },
  streamId: "string > 0",
});

export const chatStreamElicitationResolveInput = type({
  elicitationId: "string > 0",
  response: elicitationResponse,
  streamId: "string > 0",
});

// Input parser schemas
export const chatCreateInput = type({
  "+": "ignore",
  "cwd?": "string",
  "model?": "string",
  "mode?": "string",
  "projectId?": "string",
  "reasoningEffort?": "string",
  "runtime?": "string",
  "title?": "string",
});

export const chatPrewarmInput = type({
  "+": "ignore",
  "cwd?": "string",
  "projectId?": "string",
  "runtime?": "string",
});

export const chatRuntimeConfigInput = type({
  "+": "ignore",
  "cwd?": "string",
  "runtime?": "string",
});

export const chatSendInput = type({
  "+": "ignore",
  "attachments?": "unknown",
  "chatId?": "string",
  "cwd?": "string",
  "model?": "string",
  "mode?": "string",
  "prewarmId?": "string",
  "projectId?": "string",
  "reasoningEffort?": "string",
  "runtime?": "string",
  text: "string > 0",
});

export const chatSetModeInput = type({
  "+": "ignore",
  chatId: "string > 0",
  "cwd?": "string",
  mode: "string > 0",
});
