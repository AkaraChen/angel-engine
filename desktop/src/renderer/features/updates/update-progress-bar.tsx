import type { DesktopUpdateDownloadProgress } from "@shared/update-channel";

import { cn } from "@/platform/utils";

interface UpdateProgressBarProps {
  className?: string;
  /**
   * When omitted, the bar is indeterminate (unknown total). Never invent a
   * percent from missing data — that is the caller's job via `progress`.
   */
  progress?: DesktopUpdateDownloadProgress;
}

/**
 * Determinate when `progress.percent` is known; otherwise a sliding
 * indeterminate track. Width uses a CSS transition so throttled main-process
 * samples still look smooth.
 */
export function UpdateProgressBar({
  className,
  progress,
}: UpdateProgressBarProps) {
  const percent = progress?.percent;
  const determinate =
    percent !== undefined && Number.isFinite(percent) && percent >= 0;

  return (
    <div
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuenow={determinate ? Math.round(percent) : undefined}
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      role="progressbar"
    >
      {determinate ? (
        <div
          className="
            h-full rounded-full bg-primary transition-[width] duration-300
            ease-out
            motion-reduce:transition-none
          "
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      ) : (
        <div
          className="
            h-full w-1/3 rounded-full bg-primary
            animate-[update-progress-indeterminate_1.2s_ease-in-out_infinite]
            motion-reduce:animate-none motion-reduce:w-full
            motion-reduce:opacity-60
          "
        />
      )}
    </div>
  );
}
