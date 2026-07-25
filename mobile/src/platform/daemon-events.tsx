import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/features/auth/auth-provider";
import { useDaemonClient } from "@/platform/daemon-provider";
import { queryKeys } from "@/platform/query-keys";

export function DaemonEventSync() {
  const { token } = useAuth();
  const daemon = useDaemonClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (token === null) return;
    const reconcile = () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.attention.list,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats.list });
    };
    return daemon.events.subscribe({
      onEvent: (event) => {
        if (event.type === "chat-attention-changed") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.attention.list,
          });
        } else if (event.type === "chat-metadata-changed") {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.chats.list,
          });
        }
      },
      onOpen: reconcile,
    });
  }, [daemon, queryClient, token]);

  return null;
}
