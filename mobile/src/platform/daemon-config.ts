/**
 * Resolves how the mobile app reaches the desktop daemon.
 *
 * The mobile app is normally served by the daemon itself, so by default it
 * talks to the daemon over the **same origin** — an empty base URL, i.e. every
 * request goes to `/api/*` on `/`. No host wiring is required for that case.
 *
 * Two optional overrides exist, applied independently for base URL and token:
 *   1. `window.__ANGEL_DAEMON__` — the host injects a base URL and/or token at
 *      runtime (e.g. when the frontend and daemon are on different origins, or
 *      when the daemon's bearer token must be supplied).
 *   2. Vite env (`VITE_DAEMON_URL` / `VITE_DAEMON_TOKEN`) — handy for
 *      `pnpm dev` against a separately running daemon.
 */
export interface DaemonConfig {
  /** Empty string means same-origin: requests are made to `/api/*` on `/`. */
  baseUrl: string;
  token: string | null;
}

declare global {
  interface Window {
    __ANGEL_DAEMON__?: { baseUrl?: string; token?: string };
  }
}

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function normalizeBaseUrl(value: string | null): string {
  // null / "" / "/" all mean "same origin" — a relative "" base.
  if (value === null || value === "/") return "";
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "/") return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

export function resolveDaemonConfig(): DaemonConfig {
  const injected =
    typeof window !== "undefined" ? window.__ANGEL_DAEMON__ : undefined;

  return {
    baseUrl: normalizeBaseUrl(
      firstNonEmpty(injected?.baseUrl, import.meta.env.VITE_DAEMON_URL),
    ),
    token: firstNonEmpty(injected?.token, import.meta.env.VITE_DAEMON_TOKEN),
  };
}
