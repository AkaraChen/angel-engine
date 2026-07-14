import type {
  MobileHostingState,
  MobileHostingUpdate,
} from "@shared/mobile-hosting";

import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "@/platform/ipc";

const INITIAL_STATE: MobileHostingState = {
  available: false,
  enabled: false,
  hasPassword: false,
  host: "0.0.0.0",
  port: null,
  url: null,
};

export interface UseMobileHostingResult {
  state: MobileHostingState;
  isSaving: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  setHost: (host: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
}

export function useMobileHosting(): UseMobileHostingResult {
  const [state, setState] = useState<MobileHostingState>(INITIAL_STATE);
  const [isSaving, setIsSaving] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let active = true;
    void ipc.daemonMobileHostingGet().then((next) => {
      if (active) setState(next);
    });
    const unsubscribe = window.daemon.onMobileHostingChanged((next) => {
      setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const apply = useCallback(async (update: MobileHostingUpdate) => {
    setIsSaving(true);
    try {
      const next = await ipc.daemonMobileHostingSet(update);
      setState(next);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // `password` is intentionally omitted from field edits so the stored secret is
  // preserved by the main process (see MobileHostingUpdate).
  const setEnabled = useCallback(
    async (enabled: boolean) => {
      await apply({ enabled, host: stateRef.current.host });
    },
    [apply],
  );

  const setHost = useCallback(
    async (host: string) => {
      await apply({ enabled: stateRef.current.enabled, host });
    },
    [apply],
  );

  const setPassword = useCallback(
    async (password: string) => {
      await apply({
        enabled: stateRef.current.enabled,
        host: stateRef.current.host,
        password,
      });
    },
    [apply],
  );

  return { isSaving, setEnabled, setHost, setPassword, state };
}
