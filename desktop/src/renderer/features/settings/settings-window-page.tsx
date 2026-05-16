import type { AgentRuntime } from "@shared/agents";
import type { Chat } from "@shared/chat";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import { deleteAllChatsMutationOptions } from "@/features/chat/api/queries";
import { cancelAllChatRuns } from "@/features/chat/state/chat-run-store";
import { SettingsPage } from "@/features/settings/settings-page";
import { useAgentSettings } from "@/features/settings/use-agent-settings";
import { queryKeys } from "@/platform/query-keys";
import { useApi } from "@/platform/use-api";

const EMPTY_CHATS: Chat[] = [];

export function SettingsWindowPage() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();
  const [agentSettings, updateAgentSettings] = useAgentSettings();
  const deleteAllChatsMutation = useMutation({
    ...deleteAllChatsMutationOptions({ api, queryClient }),
  });

  const setAgentEnabled = useCallback(
    (runtime: AgentRuntime, enabled: boolean) => {
      updateAgentSettings((current) => {
        const enabledRuntimes = new Set(current.enabledRuntimes);
        if (enabled) {
          enabledRuntimes.add(runtime);
        } else {
          enabledRuntimes.delete(runtime);
        }
        return {
          ...current,
          enabledRuntimes: [...enabledRuntimes],
        };
      });
    },
    [updateAgentSettings],
  );

  const deleteAllChats = useCallback(async () => {
    try {
      const result = await deleteAllChatsMutation.mutateAsync();
      cancelAllChatRuns();
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), EMPTY_CHATS);
      queryClient.removeQueries({ queryKey: queryKeys.chats.details() });
      toast({
        description: t("notifications.chatsDeletedDescription", {
          count: result.deletedCount,
        }),
        title: t("notifications.chatsDeleted"),
      });
    } catch (error) {
      toast({
        description: error instanceof Error ? error.message : String(error),
        title: t("notifications.couldNotDeleteChats"),
        variant: "destructive",
      });
    }
  }, [deleteAllChatsMutation, queryClient, t, toast]);

  return (
    <div className="flex h-svh min-h-0 overflow-auto bg-background">
      <SettingsPage
        agentSettings={agentSettings}
        isDeletingChats={deleteAllChatsMutation.isPending}
        onAgentEnabledChange={setAgentEnabled}
        onDeleteAllChats={deleteAllChats}
      />
    </div>
  );
}
