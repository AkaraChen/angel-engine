import type { DesktopUpdateStatus } from "@shared/update-channel";

import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  SettingsGroup,
  SettingsRow,
} from "@/features/settings/settings-controls";
import { useUpdateStatus } from "@/features/settings/use-update-status";

export function UpdateSettings() {
  const { t } = useTranslation();
  const { checkForUpdates, setChannel, status } = useUpdateStatus();

  if (!status) return null;

  const busy = status.state === "checking" || status.state === "downloading";

  return (
    <SettingsGroup description={t("settings.updates.description")}>
      <SettingsRow
        after={
          <span className="text-sm text-muted-foreground">
            {status.currentVersion}
          </span>
        }
        title={t("settings.updates.currentVersionTitle")}
      />
      <SettingsRow
        after={
          <Switch
            aria-label={t("settings.updates.betaSwitchLabel")}
            checked={status.channel === "beta"}
            onCheckedChange={(checked) => {
              void setChannel(checked ? "beta" : "stable");
            }}
          />
        }
        description={t("settings.updates.betaDescription")}
        title={t("settings.updates.betaTitle")}
      />
      <SettingsRow
        after={
          status.state === "downloaded" ? (
            <Button
              onClick={() => void window.desktopWindow.installUpdate()}
              type="button"
            >
              {t("settings.updates.installButton")}
            </Button>
          ) : (
            <Button
              disabled={busy || !status.supported}
              onClick={() => void checkForUpdates()}
              type="button"
              variant="outline"
            >
              {t("settings.updates.checkButton")}
            </Button>
          )
        }
        align="start"
        description={updateStateDescription(status, t)}
        title={t("settings.updates.checkTitle")}
      />
    </SettingsGroup>
  );
}

function updateStateDescription(
  status: DesktopUpdateStatus,
  t: (key: string, options?: Record<string, string>) => string,
) {
  if (!status.supported) return t("settings.updates.unsupported");

  switch (status.state) {
    case "checking":
      return t("settings.updates.stateChecking");
    case "downloading":
      return t("settings.updates.stateDownloading", {
        version: status.availableVersion ?? "",
      });
    case "downloaded":
      return t("settings.updates.stateDownloaded", {
        version: status.availableVersion ?? "",
      });
    case "error":
      return t("settings.updates.stateError", {
        detail: status.errorMessage ?? "",
      });
    case "idle":
      return t("settings.updates.stateIdle");
  }
}
