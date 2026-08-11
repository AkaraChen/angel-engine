import type { DesktopUpdateDownloadProgress } from "./update-channel";

/** How often the main process may push progress to renderers. */
export const UPDATE_PROGRESS_THROTTLE_MS = 300;

/**
 * electron-updater's ProgressInfo always carries numeric fields; a missing
 * Content-Length shows up as `total <= 0` (and often `percent` 0/NaN). Treat
 * that as indeterminate rather than a real 0%.
 */
export function normalizeUpdateProgress(input: {
  bytesPerSecond: number;
  percent: number;
  total: number;
  transferred: number;
}): DesktopUpdateDownloadProgress {
  const transferred = finiteNonNegative(input.transferred);
  const bytesPerSecond = finiteNonNegative(input.bytesPerSecond);
  const total = finiteNonNegative(input.total);

  if (total <= 0) {
    return { bytesPerSecond, transferred };
  }

  const rawPercent = Number.isFinite(input.percent)
    ? input.percent
    : (transferred / total) * 100;

  return {
    bytesPerSecond,
    percent: clampPercent(rawPercent),
    total,
    transferred,
  };
}

/**
 * Merge a new sample into the last reported progress so percent never goes
 * backwards mid-download (jitter from multi-file or differential updates).
 */
export function mergeUpdateProgress(
  previous: DesktopUpdateDownloadProgress | undefined,
  next: DesktopUpdateDownloadProgress,
): DesktopUpdateDownloadProgress {
  if (previous === undefined) return next;

  const transferred = Math.max(previous.transferred, next.transferred);
  const bytesPerSecond = next.bytesPerSecond;

  const previousTotal = previous.total;
  const nextTotal = next.total;
  const total =
    previousTotal !== undefined && nextTotal !== undefined
      ? Math.max(previousTotal, nextTotal)
      : (nextTotal ?? previousTotal);

  if (total === undefined || total <= 0) {
    return { bytesPerSecond, transferred };
  }

  const previousPercent = previous.percent ?? 0;
  const nextPercent =
    next.percent ??
    (Number.isFinite(transferred / total) ? (transferred / total) * 100 : 0);

  return {
    bytesPerSecond,
    percent: clampPercent(Math.max(previousPercent, nextPercent)),
    total,
    transferred,
  };
}

export function shouldBroadcastUpdateProgress({
  force,
  lastBroadcastAt,
  now,
  throttleMs = UPDATE_PROGRESS_THROTTLE_MS,
}: {
  force?: boolean;
  lastBroadcastAt: number | undefined;
  now: number;
  throttleMs?: number;
}) {
  if (force) return true;
  if (lastBroadcastAt === undefined) return true;
  return now - lastBroadcastAt >= throttleMs;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function finiteNonNegative(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}
