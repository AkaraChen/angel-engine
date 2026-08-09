import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type { Chat } from "@angel-engine/daemon-api/chat";

import is from "@sindresorhus/is";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation } from "wouter";
import { chatRoutePath } from "@/app/workspace/workspace-route-paths";
import {
  isProjectWorkspaceMode,
  useWorkspaceUiStore,
} from "@/app/workspace/workspace-ui-store";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";
import { queryKeys } from "@/platform/query-keys";

export interface SessionHandoffRequest {
  /** Prompt already formatted as a context pack. */
  prompt: string;
  sourceChat: Chat;
  targetRuntime: AgentRuntime;
  title?: string;
}

/**
 * Start a new session for a handoff. Reuses the source chat's workspace
 * (cwd + projectId). The source chat is left intact so it stays viewable.
 */
export function useSessionHandoff() {
  const startRun = useChatRunStore((state) => state.startRun);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  return useCallback(
    async ({
      prompt,
      sourceChat,
      targetRuntime,
      title,
    }: SessionHandoffRequest) =>
      startRun({
        callbacks: {
          onChatCreated: (chat) => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.chats.list(),
            });
            navigate(
              chatRoutePath(chat, {
                includeProject: isProjectWorkspaceMode(workspaceMode),
              }),
            );
          },
        },
        input: {
          cwd: is.nonEmptyString(sourceChat.cwd) ? sourceChat.cwd : undefined,
          projectId: is.nonEmptyString(sourceChat.projectId)
            ? sourceChat.projectId
            : undefined,
          runtime: targetRuntime,
          title,
        },
        message: {
          attachments: [],
          content: [{ text: prompt, type: "text" }],
          createdAt: new Date(),
          metadata: { custom: {} },
          parentId: null,
          role: "user",
          runConfig: undefined,
          sourceId: null,
        },
        slotKey: `session-handoff:${sourceChat.id}:${targetRuntime}:${Date.now()}`,
      }),
    [navigate, queryClient, startRun, workspaceMode],
  );
}
