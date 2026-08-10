import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import {
  SettingsRow,
  SettingsSection,
} from "@/features/settings/settings-section";
import { useDaemonHealth } from "@/platform/use-daemon-health";

/**
 * Surfaces which daemon this browser is paired with, the live connection
 * state, and a deliberate "Disconnect this device" action that only clears the
 * local token — never the desktop pairing password or chat history.
 */
export function ConnectionSection() {
  const { t } = useTranslation();
  const { baseUrl, signOut, token } = useAuth();
  const health = useDaemonHealth();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const serverOrigin = useMemo(() => {
    if (baseUrl.length > 0) return baseUrl;
    if (typeof window !== "undefined") return window.location.origin;
    return t("settings.connection.sameOrigin");
  }, [baseUrl, t]);

  const connectionLabel = health.isError
    ? t("settings.connection.statusUnreachable")
    : health.isPending
      ? t("settings.connection.statusConnecting")
      : t("settings.connection.statusOnline");

  const versionLabel =
    health.data !== undefined
      ? health.data.version
      : t("settings.connection.versionUnknown");

  // Only a device that holds a paired token can disconnect; injected dev tokens
  // and auth-less daemons have nothing local to clear.
  const canDisconnect = token !== null;

  function disconnect() {
    // Drop cached authenticated data before the token so a later re-pair does
    // not briefly rehydrate another session's chats or settings.
    void queryClient.cancelQueries();
    queryClient.clear();
    signOut();
  }

  return (
    <>
      <SettingsSection
        description={t("settings.connection.description")}
        title={t("settings.connection.title")}
      >
        <SettingsRow
          description={serverOrigin}
          title={t("settings.connection.server")}
        />
        <SettingsRow
          description={connectionLabel}
          title={t("settings.connection.status")}
        />
        <SettingsRow
          description={versionLabel}
          title={t("settings.connection.daemonVersion")}
        />
      </SettingsSection>

      {canDisconnect ? (
        <SettingsSection
          description={t("settings.connection.disconnectDescription")}
          title={t("settings.connection.disconnectSectionTitle")}
        >
          <div className="p-3">
            <Button
              className="h-11 w-full"
              onClick={() => setConfirmOpen(true)}
              type="button"
              variant="destructive"
            >
              {t("settings.connection.disconnect")}
            </Button>
          </div>
        </SettingsSection>
      ) : null}

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("settings.connection.disconnectConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.connection.disconnectConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={disconnect} variant="destructive">
              {t("settings.connection.disconnectConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
