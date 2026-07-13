import type { Chat } from "@angel-engine/daemon-api/chat";
import { rememberAgentOrder } from "@angel-engine/daemon-api/agents";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/ui/toast";
import { deleteAllChatsMutationOptions } from "@/features/chat/api/queries";
import { broadcastAllChatsDeleted } from "@/features/chat/chat-metadata-events";
import { cancelAllChatRuns } from "@/features/chat/state/chat-run-store";
import { SettingsPage } from "@/features/settings/settings-page";
import { useSettingsStore } from "@/features/settings/settings-store";
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
  const availableAgentOptions = useSettingsStore(
    (state) => state.availableAgentOptions,
  );
  const setAgentEnabled = useSettingsStore((state) => state.setAgentEnabled);
  const deleteAllChatsMutation = useMutation({
    ...deleteAllChatsMutationOptions({ api, queryClient }),
  });

  const deleteAllChats = useCallback(async () => {
    try {
      const result = await deleteAllChatsMutation.mutateAsync();
      cancelAllChatRuns();
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), EMPTY_CHATS);
      queryClient.removeQueries({ queryKey: queryKeys.chats.details() });
      broadcastAllChatsDeleted();
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
        availableAgentOptions={availableAgentOptions}
        isDeletingChats={deleteAllChatsMutation.isPending}
        onAgentEnabledChange={setAgentEnabled}
        onAgentOrderChange={(orderedRuntimes) =>
          updateAgentSettings((current) =>
            rememberAgentOrder(current, orderedRuntimes),
          )
        }
        onDeleteAllChats={deleteAllChats}
      />
    </div>
  );
}
