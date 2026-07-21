import { useQuery } from "@tanstack/react-query";

import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

/**
 * Load the chat metadata to resolve its workspace root (`cwd`). Shares the query
 * key with the header title lookup so it's deduped, not a second request.
 */
export function useChatWorkspaceRoot(chatId: string): {
  root: string | null;
  isPending: boolean;
} {
  const daemon = useDaemonClient();
  const query = useQuery({
    queryKey: queryKeys.chats.detail(chatId),
    queryFn: async () => daemon.chats.get(chatId),
    enabled: chatId.length > 0,
  });
  const cwd = query.data?.cwd ?? null;
  return {
    root: cwd !== null && cwd.length > 0 ? cwd : null,
    isPending: query.isPending,
  };
}

/**
 * Read live git state for a workspace root. `enabled` lets the panel defer the
 * request until the bottom sheet is opened so a closed panel costs nothing.
 */
export function useWorkspaceGitStatus(root: string | null, enabled: boolean) {
  const daemon = useDaemonClient();
  return useQuery({
    queryKey: queryKeys.workspace.gitDiff(root ?? ""),
    queryFn: async () => daemon.workspaceTools.gitDiff({ root: root ?? "" }),
    enabled: enabled && root !== null,
    // Workspace state changes as the agent works; keep it fresh but avoid a
    // request storm while the sheet is open.
    staleTime: 5_000,
  });
}
