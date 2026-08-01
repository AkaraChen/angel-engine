import type { DesktopUpdateStatus } from "@shared/update-channel";
import type { ComponentType } from "react";

import {
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  Info,
  WarningCircle,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  SettingsGroup,
  SettingsRow,
} from "@/features/settings/settings-controls";
import { useUpdateStatus } from "@/features/settings/use-update-status";
import { cn } from "@/platform/utils";

type UpdateTone = "attention" | "danger" | "info" | "primary" | "success";

/**
 * The update state is the one thing on this pane a user actually scans for, so
 * it gets a soft-tinted band rather than another line of grey body copy. Tones
 * follow the status triple: in flight is informational, an available build is
 * the accent, a settled install is success, a failed check is danger.
 */
const updateToneClassName: Record<UpdateTone, string> = {
  attention: `
    border-status-attention-border bg-status-attention-soft
    text-status-attention
  `,
  danger:
    "border-status-danger-border bg-status-danger-soft text-status-danger",
  info: "border-status-info-border bg-status-info-soft text-status-info",
  primary: "border-primary/25 bg-primary-soft text-primary-soft-foreground",
  success: `
    border-status-success-border bg-status-success-soft text-status-success
  `,
};

const updateToneIcon: Record<
  UpdateTone,
  ComponentType<{ className?: string }>
> = {
  attention: Info,
  danger: WarningCircle,
  info: CircleNotch,
  primary: DownloadSimple,
  success: CheckCircle,
};

export function UpdateSettings() {
  const { t } = useTranslation();
  const { checkForUpdates, setChannel, status } = useUpdateStatus();

  if (!status) return null;

  const busy = status.state === "checking" || status.state === "downloading";
  const tone = updateTone(status);
  const ToneIcon = updateToneIcon[tone];

  return (
    <SettingsGroup description={t("settings.updates.description")}>
      <SettingsRow
        after={
          <span className="font-mono text-sm tabular-nums text-muted-foreground">
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
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm leading-snug font-medium">
              {t("settings.updates.betaTitle")}
            </span>
            <span
              aria-hidden="true"
              className="
                shrink-0 rounded-full bg-status-attention-soft px-2 py-0.5
                font-mono text-[0.625rem] font-medium tracking-wide
                text-status-attention uppercase
              "
            >
              Beta
            </span>
          </span>
          <span
            className="
              mt-1 block text-xs leading-[1.55] wrap-break-word
              text-muted-foreground
            "
          >
            {t("settings.updates.betaDescription")}
          </span>
        </span>
      </SettingsRow>
      <SettingsRow after={null}>
        <span
          className="
            flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3
          "
        >
          <span
            className={cn(
              `
                flex min-w-56 flex-1 items-start gap-2 rounded-lg border
                px-2.5 py-1.5 text-xs leading-[1.55]
              `,
              updateToneClassName[tone],
            )}
          >
            <ToneIcon
              className={cn(
                "mt-px size-3.5 shrink-0",
                busy && "animate-spin motion-reduce:animate-none",
              )}
            />
            <span className="min-w-0 wrap-break-word">
              {updateStateDescription(status, t)}
            </span>
          </span>
          {status.state === "downloaded" ? (
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
          )}
        </span>
      </SettingsRow>
    </SettingsGroup>
  );
}

function updateTone(status: DesktopUpdateStatus): UpdateTone {
  if (!status.supported) return "attention";

  switch (status.state) {
    case "checking":
    case "downloading":
      return "info";
    case "downloaded":
      return "primary";
    case "error":
      return "danger";
    case "idle":
      return "success";
  }
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
