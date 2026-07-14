export const MOBILE_HOSTING_CHANGED_CHANNEL = "mobile-hosting:changed";

/** Default bind host — the wildcard address so LAN devices can reach the app. */
export const DEFAULT_MOBILE_HOST = "0.0.0.0";

/** Persisted, user-editable mobile hosting settings. */
export interface MobileHostingConfig {
  /** Whether the daemon serves the mobile web app for other devices. */
  enabled: boolean;
  /** Network interface the daemon binds to (e.g. `0.0.0.0`). */
  host: string;
}

/** Runtime view of mobile hosting, including the reachable URL. */
export interface MobileHostingState extends MobileHostingConfig {
  /** True when the daemon is connected and actively serving the mobile app. */
  available: boolean;
  /** Port the daemon is currently bound to, when known. */
  port: number | null;
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
  return { enabled: input.enabled === true, host };
}
