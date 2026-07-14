/**
 * Resolves how the mobile app reaches the desktop daemon.
 *
 * The mobile app is normally served by the daemon itself, so by default it
 * talks to the daemon over the **same origin** — an empty base URL, i.e. every
 * request goes to `/api/*` on `/`.
 *
 * Auth is a **pairing flow**, not an injected credential: the served page
 * carries no token. When the daemon requires auth it injects
 * `window.__ANGEL_DAEMON__.requiresAuth = true`; the app then asks the user for
 * the pairing password and exchanges it for a session token via
 * `/api/auth/pair` (see `features/auth`). The resolved token below is only the
 * optional `VITE_DAEMON_TOKEN` dev override for running `pnpm dev` against a
 * separately running daemon.
 */
export interface DaemonConfig {
  /** Empty string means same-origin: requests are made to `/api/*` on `/`. */
  baseUrl: string;
  /** Dev-only bearer token (from `VITE_DAEMON_TOKEN`); null in production. */
  token: string | null;
  /** Whether the daemon requires the mobile app to pair before calling `/api/*`. */
  requiresAuth: boolean;
}

declare global {
  interface Window {
    __ANGEL_DAEMON__?: { baseUrl?: string; requiresAuth?: boolean };
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
    requiresAuth: injected?.requiresAuth === true,
    token: firstNonEmpty(import.meta.env.VITE_DAEMON_TOKEN),
  };
}
