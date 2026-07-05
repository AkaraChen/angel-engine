import type { AgentRuntime } from "@shared/agents";

import is from "@sindresorhus/is";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation } from "wouter";
import { chatRoutePath } from "@/app/workspace/workspace-route-paths";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { useChatEnvironment } from "@/features/chat/runtime/chat-environment-context";
import { useChatRunStore } from "@/features/chat/state/chat-run-store";
import { queryKeys } from "@/platform/query-keys";

// Hands a plan off to another agent by creating a brand-new chat whose first
// message is the plan prompt. It reuses the shared chat run store (the same
// path a composer uses to create a chat), then opens the new thread. No extra
// state store or bus is involved.
export function usePlanHandoff() {
  const startRun = useChatRunStore((state) => state.startRun);
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const { cwd, projectId } = useChatEnvironment();
  const workspaceMode = useWorkspaceUiStore((state) => state.workspaceMode);

  return useCallback(
    async (runtime: AgentRuntime, prompt: string) =>
      startRun({
        callbacks: {
          onChatCreated: (chat) => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.chats.list(),
            });
            navigate(
              chatRoutePath(chat, { includeProject: workspaceMode === "work" }),
            );
          },
        },
        input: {
          cwd: is.nonEmptyString(cwd) ? cwd : undefined,
          projectId: is.nonEmptyString(projectId) ? projectId : undefined,
          runtime,
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
        slotKey: `handoff:${runtime}:${Date.now()}`,
      }),
    [cwd, navigate, projectId, queryClient, startRun, workspaceMode],
  );
}
