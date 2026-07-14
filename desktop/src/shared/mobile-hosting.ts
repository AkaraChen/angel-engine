export const MOBILE_HOSTING_CHANGED_CHANNEL = "mobile-hosting:changed";

/** Default bind host — the wildcard address so LAN devices can reach the app. */
export const DEFAULT_MOBILE_HOST = "0.0.0.0";

export interface MobileHostingListenAddress {
  address: string;
  interfaceName: string;
}

/** Persisted, user-editable mobile hosting settings. */
export interface MobileHostingConfig {
  /** Whether the daemon serves the mobile web app for other devices. */
  enabled: boolean;
  /** Network interface the daemon binds to (e.g. `0.0.0.0`). */
  host: string;
  /** TCP port the daemon binds to while mobile hosting is enabled. Zero is automatic. */
  port: number;
  /**
   * Password a phone must enter to pair with the daemon. Empty means no
   * password is set yet — the mobile app cannot be served until one exists.
   */
  password: string;
}

/**
 * Update sent from the renderer. `password` is optional so the UI can save
 * other fields without echoing the secret back: omitted / empty keeps the
 * stored password unchanged.
 */
export interface MobileHostingUpdate {
  enabled: boolean;
  host: string;
  port: number;
  password?: string;
}

/** Runtime view of mobile hosting. Never carries the plaintext password. */
export interface MobileHostingState {
  enabled: boolean;
  host: string;
  /** Whether a pairing password has been set. */
  hasPassword: boolean;
  /** True when the daemon is connected and actively serving the mobile app. */
  available: boolean;
  /** Port the daemon is currently bound to, when known. */
  port: number | null;
  /** Configured listen port. Zero means automatic. */
  listenPort: number;
  /** Reachable `http://host:port/` URL for a phone, or null when unavailable. */
  url: string | null;
}

export function sanitizeMobileHostingConfig(
  value: unknown,
): MobileHostingConfig {
  const input = (value ?? {}) as Partial<MobileHostingConfig>;
  const host =
    typeof input.host === "string" && input.host.trim().length > 0
      ? input.host.trim()
      : DEFAULT_MOBILE_HOST;
  const password = typeof input.password === "string" ? input.password : "";
  const port =
    typeof input.port === "number" &&
    Number.isInteger(input.port) &&
    input.port >= 0 &&
    input.port <= 65_535
      ? input.port
      : 0;
  return {
    enabled: input.enabled === true && password.length > 0,
    host,
    password,
    port,
  };
}
