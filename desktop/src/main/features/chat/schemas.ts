import { type } from "arktype";

// Stream IPC schemas
const elicitationAnswer = type({
  id: "string > 0",
  value: "string > 0",
});

const chatId = type("string > 0");

const elicitationResponse = type({
  type: "'allow' | 'allowForSession' | 'deny' | 'cancel' | 'externalComplete' | 'answers' | 'dynamicToolResult' | 'raw'",
  "answers?": elicitationAnswer.array(),
  "success?": "boolean",
  "value?": "string > 0",
});

export const chatStreamStartInput = type({
  input: {
    attachments: "unknown",
    "chatId?": "string > 0 | undefined",
    "creationLocation?": "'project' | 'worktree' | undefined",
    "cwd?": "string > 0 | undefined",
    "model?": "string > 0 | undefined",
    "mode?": "string > 0 | undefined",
    "permissionMode?": "string > 0 | undefined",
    "prewarmId?": "string > 0 | undefined",
    "projectId?": "string > 0 | undefined",
    "reasoningEffort?": "string > 0 | undefined",
    "runtime?": "string > 0 | undefined",
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
  "creationLocation?": "'project' | 'worktree' | undefined",
  "model?": "string > 0 | undefined",
  "mode?": "string > 0 | undefined",
  "permissionMode?": "string > 0 | undefined",
  "projectId?": "string > 0 | undefined",
  "reasoningEffort?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
  "title?": "string > 0 | undefined",
});

export const chatPrewarmInput = type({
  "+": "ignore",
  "creationLocation?": "'project' | 'worktree' | undefined",
  "projectId?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
});

export const chatRenameInput = type({
  "+": "ignore",
  chatId: "string > 0",
  title: "string > 0",
});

export const chatIdsInput = type({
  "+": "ignore",
  chatIds: chatId.array(),
});

export const chatRuntimeConfigInput = type({
  "+": "ignore",
  "cwd?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
});

export const chatSendInput = type({
  "+": "ignore",
  "attachments?": "unknown | undefined",
  "chatId?": "string > 0 | undefined",
  "creationLocation?": "'project' | 'worktree' | undefined",
  "cwd?": "string > 0 | undefined",
  "model?": "string > 0 | undefined",
  "mode?": "string > 0 | undefined",
  "permissionMode?": "string > 0 | undefined",
  "prewarmId?": "string > 0 | undefined",
  "projectId?": "string > 0 | undefined",
  "reasoningEffort?": "string > 0 | undefined",
  "runtime?": "string > 0 | undefined",
  text: "string > 0",
});

export const chatSetModeInput = type({
  "+": "ignore",
  chatId: "string > 0",
  mode: "string > 0",
});

export const chatSetPermissionModeInput = type({
  "+": "ignore",
  chatId: "string > 0",
  mode: "string > 0",
});

export const chatSetRuntimeInput = type({
  "+": "ignore",
  chatId: "string > 0",
  runtime: "string > 0",
});
