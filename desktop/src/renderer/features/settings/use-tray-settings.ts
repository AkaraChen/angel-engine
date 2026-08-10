import type { DesktopTrayPreferences } from "@shared/tray";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/platform/ipc";

const TRAY_PREFERENCES_QUERY_KEY = ["settings", "tray"] as const;

const INITIAL_PREFERENCES: DesktopTrayPreferences = {
  enabled: true,
};

export function useTraySettings() {
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({
    queryFn: () => ipc.trayGetPreferences(),
    queryKey: TRAY_PREFERENCES_QUERY_KEY,
  });
  const setEnabledMutation = useMutation({
    mutationFn: (enabled: boolean) => ipc.traySetEnabled({ enabled }),
    onSuccess: (next) => {
      queryClient.setQueryData(TRAY_PREFERENCES_QUERY_KEY, next);
    },
  });

  return {
    enabled: preferencesQuery.data?.enabled ?? INITIAL_PREFERENCES.enabled,
    isSaving: setEnabledMutation.isPending,
    setEnabled: async (enabled: boolean) => {
      await setEnabledMutation.mutateAsync(enabled);
    },
  };
}
