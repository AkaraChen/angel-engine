import type { DesktopUpdateStatus } from "@shared/update-channel";

import {
  ArrowClockwise,
  CheckCircle,
  CircleNotch,
  DownloadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useUpdateStatus } from "@/features/settings/use-update-status";
import { UpdateProgressBar } from "@/features/updates/update-progress-bar";
import {
  updateStateDetail,
  updateStateTitle,
} from "@/features/updates/update-status-copy";
import { formatDateTime } from "@/platform/format-time";
import { cn } from "@/platform/utils";

/**
 * Non-modal surface for background update work. Settings still shows the full
 * row; this only appears while something is actively happening (or failed /
 * ready) so a download never steals focus with a dialog.
 */
export function UpdateStatusBanner() {
  const { t } = useTranslation();
  const { checkForUpdates, status } = useUpdateStatus();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  if (status === undefined || !shouldShowBanner(status)) return null;

  const bannerKey = statusKey(status);
  if (dismissedKey === bannerKey) return null;

  const busy =
    status.state === "checking" ||
    status.state === "downloading" ||
    status.state === "installing";
  const title = updateStateTitle(status, t);
  const detail = updateStateDetail(status, t, (epochMs) =>
    formatDateTime(new Date(epochMs).toISOString()),
  );

  return (
    <div
      aria-live="polite"
      className="
        pointer-events-none fixed right-4 bottom-4 z-50 flex
        w-[min(22rem,calc(100vw-2rem))] justify-end
      "
      data-testid="update-status-banner"
    >
      <div
        className={cn(
          `
            pointer-events-auto w-full rounded-xl border bg-card p-3
            text-card-foreground shadow-popover
          `,
          status.state === "error" && "border-status-danger-border",
          status.state === "downloaded" && "border-primary/30",
        )}
      >
        <div className="flex items-start gap-2.5">
          <BannerIcon busy={busy} state={status.state} />
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug font-medium">{title}</p>
            {detail ? (
              <p className="mt-1 text-xs leading-[1.55] text-muted-foreground">
                {detail}
              </p>
            ) : null}
            {status.state === "downloading" ? (
              <UpdateProgressBar
                className="mt-2.5"
                progress={status.progress}
              />
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {status.state === "downloaded" ? (
                <Button
                  onClick={() => void window.desktopWindow.installUpdate()}
                  size="sm"
                  type="button"
                >
                  {t("settings.updates.installButton")}
                </Button>
              ) : null}
              {status.state === "error" ? (
                <Button
                  onClick={() => void checkForUpdates()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <ArrowClockwise className="size-3.5" />
                  {t("common.retry")}
                </Button>
              ) : null}
              {status.state === "downloaded" || status.state === "error" ? (
                <Button
                  onClick={() => setDismissedKey(bannerKey)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("common.close")}
                </Button>
              ) : (
                <Button
                  aria-label={t("common.close")}
                  className="ml-auto size-7 p-0"
                  onClick={() => setDismissedKey(bannerKey)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BannerIcon({
  busy,
  state,
}: {
  busy: boolean;
  state: DesktopUpdateStatus["state"];
}) {
  const className = cn(
    "mt-0.5 size-4 shrink-0",
    busy && "animate-spin motion-reduce:animate-none",
    state === "error" && "text-status-danger",
    state === "downloaded" && "text-primary",
  );

  if (state === "error") return <WarningCircle className={className} />;
  if (state === "downloaded") return <CheckCircle className={className} />;
  if (state === "downloading") return <DownloadSimple className={className} />;
  return <CircleNotch className={className} />;
}

function shouldShowBanner(status: DesktopUpdateStatus) {
  if (!status.supported) return false;
  return (
    status.state === "checking" ||
    status.state === "downloading" ||
    status.state === "installing" ||
    status.state === "downloaded" ||
    status.state === "error"
  );
}

function statusKey(status: DesktopUpdateStatus) {
  return [
    status.state,
    status.availableVersion ?? "",
    status.errorMessage ?? "",
    status.lastCheckedAt ?? "",
  ].join(":");
}
