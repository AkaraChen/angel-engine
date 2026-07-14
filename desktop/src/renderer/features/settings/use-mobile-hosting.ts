import type {
  MobileHostingListenAddress,
  MobileHostingState,
  MobileHostingUpdate,
} from "@shared/mobile-hosting";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ipc } from "@/platform/ipc";

const MOBILE_HOSTING_QUERY_KEY = ["settings", "mobileHosting"] as const;
const MOBILE_HOSTING_LISTEN_ADDRESSES_QUERY_KEY = [
  "settings",
  "mobileHosting",
  "listenAddresses",
] as const;

const INITIAL_STATE: MobileHostingState = {
  available: false,
  enabled: false,
  hasPassword: false,
  host: "0.0.0.0",
  listenPort: 0,
  port: null,
  url: null,
};

export interface UseMobileHostingResult {
  state: MobileHostingState;
  listenAddresses: MobileHostingListenAddress[];
  isSaving: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  enableWithPassword: (password: string) => Promise<void>;
  setHost: (host: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  setPort: (port: number) => Promise<void>;
}

export function useMobileHosting(): UseMobileHostingResult {
  const queryClient = useQueryClient();
  const stateQuery = useQuery({
    queryFn: () => ipc.daemonMobileHostingGet(),
    queryKey: MOBILE_HOSTING_QUERY_KEY,
  });
  const listenAddressesQuery = useQuery({
    queryFn: () => ipc.daemonMobileHostingListenAddresses(),
    queryKey: MOBILE_HOSTING_LISTEN_ADDRESSES_QUERY_KEY,
  });
  const updateMutation = useMutation({
    mutationFn: (update: MobileHostingUpdate) =>
      ipc.daemonMobileHostingSet(update),
    onSuccess: (next) => {
      queryClient.setQueryData(MOBILE_HOSTING_QUERY_KEY, next);
    },
  });
  const state = stateQuery.data ?? INITIAL_STATE;

  useEffect(() => {
    const unsubscribe = window.daemon.onMobileHostingChanged((next) => {
      queryClient.setQueryData(MOBILE_HOSTING_QUERY_KEY, next);
    });
    return unsubscribe;
  }, [queryClient]);

  // `password` is intentionally omitted from field edits so the stored secret is
  // preserved by the main process (see MobileHostingUpdate).
  const setEnabled = async (enabled: boolean) => {
    await updateMutation.mutateAsync({
      enabled,
      host: state.host,
      port: state.listenPort,
    });
  };
  const setHost = async (host: string) => {
    await updateMutation.mutateAsync({
      enabled: state.enabled,
      host,
      port: state.listenPort,
    });
  };
  const setPassword = async (password: string) => {
    await updateMutation.mutateAsync({
      enabled: state.enabled,
      host: state.host,
      password,
      port: state.listenPort,
    });
  };
  const enableWithPassword = async (password: string) => {
    await updateMutation.mutateAsync({
      enabled: true,
      host: state.host,
      password,
      port: state.listenPort,
    });
  };
  const setPort = async (port: number) => {
    await updateMutation.mutateAsync({
      enabled: state.enabled,
      host: state.host,
      port,
    });
  };

  return {
    enableWithPassword,
    isSaving: updateMutation.isPending,
    listenAddresses: listenAddressesQuery.data ?? [],
    setEnabled,
    setHost,
    setPassword,
    setPort,
    state,
  };
}
