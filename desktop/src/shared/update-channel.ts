/**
 * Update channels are a publish-side concept: stable releases carry the
 * `latest` electron-updater channel files, pre-releases carry the `beta` ones.
 * The desktop app never inspects version strings to decide what it may install.
 */
export type DesktopUpdateChannel = "beta" | "stable";

export type DesktopUpdateState =
  | "checking"
  | "downloaded"
  | "downloading"
  | "error"
  | "idle";

export interface DesktopUpdateStatus {
  /** Version offered by the feed, once a check has found one. */
  availableVersion?: string;
  channel: DesktopUpdateChannel;
  currentVersion: string;
  errorMessage?: string;
  /** Epoch milliseconds of the last completed check. */
  lastCheckedAt?: number;
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
