import type {
  DesktopUpdateChannel,
  DesktopUpdateStatus,
} from "@shared/update-channel";

import { useCallback, useEffect, useState } from "react";

/**
 * Update state lives in the main process — the updater has to know the channel
 * before any window exists — so the renderer only mirrors it.
 */
export function useUpdateStatus() {
  const [status, setStatus] = useState<DesktopUpdateStatus | undefined>();

  useEffect(() => {
    let active = true;

    void window.desktopWindow.getUpdateStatus().then((next) => {
      if (active) setStatus(next);
    });

    const unsubscribe = window.desktopWindow.onUpdateStatusChanged(setStatus);

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const setChannel = useCallback(async (channel: DesktopUpdateChannel) => {
    setStatus(await window.desktopWindow.setUpdateChannel({ channel }));
  }, []);

  const checkForUpdates = useCallback(async () => {
    setStatus(await window.desktopWindow.checkForUpdates());
  }, []);

  return { checkForUpdates, setChannel, status };
}
