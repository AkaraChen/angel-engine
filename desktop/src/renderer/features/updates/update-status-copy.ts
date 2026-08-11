import type { DesktopUpdateStatus } from "@shared/update-channel";

import {
  formatUpdateBytes,
  formatUpdateSpeed,
} from "@/features/updates/update-format";

type Translate = (key: string, options?: Record<string, string>) => string;

/** Human-readable primary line for a given update status. */
export function updateStateTitle(
  status: DesktopUpdateStatus,
  t: Translate,
): string {
  if (!status.supported) return t("settings.updates.unsupported");

  switch (status.state) {
    case "checking":
      return t("settings.updates.stateChecking");
    case "downloading":
      return t("settings.updates.stateDownloading", {
        version: status.availableVersion ?? "",
      });
    case "installing":
      return t("settings.updates.stateInstalling", {
        version: status.availableVersion ?? "",
      });
    case "downloaded":
      return t("settings.updates.stateDownloaded", {
        version: status.availableVersion ?? "",
      });
    case "error":
      return t("settings.updates.stateError", {
        detail: status.errorMessage ?? t("updates.checkFailedDetail"),
      });
    case "idle":
      return status.lastCheckedAt === undefined
        ? t("settings.updates.stateUnchecked")
        : t("settings.updates.stateUpToDate");
  }
}

/**
 * Secondary detail line — download sizes/speed for downloading, last-checked
 * time for idle, empty otherwise so non-download states never invent progress.
 */
export function updateStateDetail(
  status: DesktopUpdateStatus,
  t: Translate,
  formatCheckedAt: (epochMs: number) => string,
): string | undefined {
  if (status.state === "downloading") {
    return formatDownloadDetail(status, t);
  }

  if (status.state === "idle" && status.lastCheckedAt !== undefined) {
    return t("settings.updates.stateIdleDetail", {
      time: formatCheckedAt(status.lastCheckedAt),
    });
  }

  return undefined;
}

function formatDownloadDetail(status: DesktopUpdateStatus, t: Translate) {
  const progress = status.progress;
  if (progress === undefined) {
    return t("settings.updates.downloadStarting");
  }

  const speed = formatUpdateSpeed(progress.bytesPerSecond);
  const transferred = formatUpdateBytes(progress.transferred);

  if (progress.total === undefined || progress.percent === undefined) {
    return speed === undefined
      ? t("settings.updates.downloadIndeterminate", { transferred })
      : t("settings.updates.downloadIndeterminateWithSpeed", {
          speed,
          transferred,
        });
  }

  const total = formatUpdateBytes(progress.total);
  const percent = String(Math.round(progress.percent));

  if (speed === undefined) {
    return t("settings.updates.downloadProgress", {
      percent,
      total,
      transferred,
    });
  }

  return t("settings.updates.downloadProgressWithSpeed", {
    percent,
    speed,
    total,
    transferred,
  });
}
