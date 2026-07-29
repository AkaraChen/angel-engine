import type { DesktopUpdateState } from "../shared/update-channel";

/**
 * Background checks are triggered by window focus and activation, which fire
 * far more often than a release ships. Throttle them to a quiet interval.
 */
export const BACKGROUND_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export function shouldRunBackgroundCheck({
  lastCheckStartedAt,
  now,
  packaged,
  state,
  supported,
}: {
  lastCheckStartedAt: number | undefined;
  now: number;
  packaged: boolean;
  state: DesktopUpdateState;
  supported: boolean;
}) {
  if (!supported || !packaged) return false;
  // A check in flight, a download in flight, or a staged update all mean there
  // is nothing useful another check could do right now.
  if (state !== "idle" && state !== "error") return false;
  if (lastCheckStartedAt === undefined) return true;

  return now - lastCheckStartedAt >= BACKGROUND_CHECK_INTERVAL_MS;
}
