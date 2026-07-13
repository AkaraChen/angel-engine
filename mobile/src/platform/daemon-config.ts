/**
 * Resolves how the mobile app reaches the desktop daemon.
 *
 * The mobile frontend is served by the desktop app, so it talks to the daemon's
 * Hono HTTP server (`/api/*`, guarded by a `Bearer <token>` header). The host
 * can inject the connection at runtime on `window.__ANGEL_DAEMON__`; otherwise
 * we fall back to Vite env vars (handy for `pnpm dev` against a running daemon),
 * and finally to same-origin with no token.
 */
export interface DaemonConfig {
  baseUrl: string;
  token: string | null;
}

declare global {
  interface Window {
    __ANGEL_DAEMON__?: { baseUrl?: string; token?: string };
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function resolveDaemonConfig(): DaemonConfig {
  const injected =
    typeof window !== "undefined" ? window.__ANGEL_DAEMON__ : undefined;
  if (injected?.baseUrl !== undefined && injected.baseUrl.length > 0) {
    return {
      baseUrl: trimTrailingSlash(injected.baseUrl),
      token: injected.token ?? null,
    };
  }

  const envUrl = import.meta.env.VITE_DAEMON_URL;
  const envToken = import.meta.env.VITE_DAEMON_TOKEN;
  if (typeof envUrl === "string" && envUrl.length > 0) {
    return {
      baseUrl: trimTrailingSlash(envUrl),
      token:
        typeof envToken === "string" && envToken.length > 0 ? envToken : null,
    };
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return {
    baseUrl: trimTrailingSlash(origin),
    token:
      typeof envToken === "string" && envToken.length > 0 ? envToken : null,
  };
}
