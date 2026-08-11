/**
 * Update channels are a publish-side concept: stable releases carry the
 * `latest` electron-updater channel files, pre-releases carry the `beta` ones.
 * The desktop app never inspects version strings to decide what it may install.
 */
export type DesktopUpdateChannel = "beta" | "stable";

/**
 * Lifecycle of a desktop update.
 *
 * - `checking` — feed request in flight
 * - `idle` — no update (or not checked yet; see `lastCheckedAt`)
 * - `downloading` — bytes arriving; may include `progress`
 * - `installing` — download finished, signature/package verification running
 * - `downloaded` — staged and waiting for restart
 * - `error` — last attempt failed; `errorMessage` explains why
 */
export type DesktopUpdateState =
  | "checking"
  | "downloaded"
  | "downloading"
  | "error"
  | "idle"
  | "installing";

/**
 * Download byte progress. `total` / `percent` are omitted when the server does
 * not report a length so the UI can render an indeterminate bar instead of
 * inventing 0% or NaN%.
 */
export interface DesktopUpdateDownloadProgress {
  bytesPerSecond: number;
  /** Present only when `total` is known. Always finite, clamped 0–100. */
  percent?: number;
  total?: number;
  transferred: number;
}

export interface DesktopUpdateStatus {
  /** Version offered by the feed, once a check has found one. */
  availableVersion?: string;
  channel: DesktopUpdateChannel;
  currentVersion: string;
  errorMessage?: string;
  /** Epoch milliseconds of the last completed check. */
  lastCheckedAt?: number;
  /** Present while `state === "downloading"` (and briefly during install). */
  progress?: DesktopUpdateDownloadProgress;
  state: DesktopUpdateState;
  /** False when the running platform has no auto-update support. */
  supported: boolean;
}

export interface DesktopUpdateChannelSetInput {
  channel: DesktopUpdateChannel;
}

export const DEFAULT_UPDATE_CHANNEL: DesktopUpdateChannel = "stable";

/**
 * electron-updater feed channel for a user-facing channel. `latest` is the
 * electron-builder default, so stable clients keep reading `latest-mac.yml`.
 */
export function feedChannelForUpdateChannel(channel: DesktopUpdateChannel) {
  return channel === "beta" ? "beta" : "latest";
}

export function parseUpdateChannel(value: unknown): DesktopUpdateChannel {
  return value === "beta" ? "beta" : DEFAULT_UPDATE_CHANNEL;
}

/** Reads the persisted `updates.json` shape, falling back to stable. */
export function readUpdateChannelFromConfig(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return DEFAULT_UPDATE_CHANNEL;
  }

  return parseUpdateChannel((value as { channel?: unknown }).channel);
}
