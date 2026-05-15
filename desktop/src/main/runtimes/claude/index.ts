import type { ChatRuntime } from "../../features/chat/runtime";

import {
  closeChatSession,
  createChatFromInput,
  inspectChatRuntimeConfig,
  loadChatSession,
  prewarmChat,
  sendChat,
  setChatMode,
  setChatPermissionMode,
  setChatRuntime,
  streamChat,
} from "./client";

export function createClaudeRuntime(): ChatRuntime {
  return {
    closeChatSession,
    createChatFromInput,
    inspectChatRuntimeConfig,
    loadChatSession,
    prewarmChat,
    sendChat,
    setChatMode,
    setChatPermissionMode,
    setChatRuntime,
    streamChat,
  };
}
