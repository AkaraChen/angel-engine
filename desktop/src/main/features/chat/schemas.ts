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
    "chatId?": "string | undefined",
    "model?": "string | undefined",
    "mode?": "string | undefined",
    "prewarmId?": "string | undefined",
    "projectId?": "string | undefined",
    "reasoningEffort?": "string | undefined",
    "runtime?": "string | undefined",
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
  "model?": "string | undefined",
  "mode?": "string | undefined",
  "projectId?": "string | undefined",
  "reasoningEffort?": "string | undefined",
  "runtime?": "string | undefined",
  "title?": "string | undefined",
});

export const chatPrewarmInput = type({
  "+": "ignore",
  "projectId?": "string | undefined",
  "runtime?": "string | undefined",
});

export const chatRuntimeConfigInput = type({
  "+": "ignore",
  "cwd?": "string | undefined",
  "runtime?": "string | undefined",
});

export const chatSendInput = type({
  "+": "ignore",
  "attachments?": "unknown | undefined",
  "chatId?": "string | undefined",
  "model?": "string | undefined",
  "mode?": "string | undefined",
  "prewarmId?": "string | undefined",
  "projectId?": "string | undefined",
  "reasoningEffort?": "string | undefined",
  "runtime?": "string | undefined",
  text: "string > 0",
});

export const chatSetModeInput = type({
  "+": "ignore",
  chatId: "string > 0",
  mode: "string > 0",
});
