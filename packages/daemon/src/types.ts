export interface DaemonInfo {
  host: string;
  port: number;
  token: string;
  pid: number;
  version: string;
}

export interface DaemonHealth {
  pid: number;
  uptime: number;
  version: string;
}

export interface DaemonOptions {
  dataDir: string;
  host?: string;
  port?: number;
  token?: string;
  version?: string;
  /**
   * Absolute path to the built mobile web bundle (the directory containing
   * `index.html`). When set together with `serveMobile`, the daemon serves
   * these static files with an SPA fallback so a phone on the LAN can load the
   * mobile app.
   */
  mobileDir?: string;
  /** Whether to serve the mobile bundle from `mobileDir`. Defaults to false. */
  serveMobile?: boolean;
  /**
   * Password a mobile client must present to `POST /api/auth/pair` to obtain a
   * session token. When set, the served bundle carries no bearer token; the
   * mobile app must pair first. Required for LAN mobile hosting to be safe.
   */
  mobilePassword?: string;
  onShutdown?: () => void;
}
