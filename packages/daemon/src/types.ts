export interface DaemonOptions {
  dataDir: string;
  migrationsDir?: string;
  packaged?: boolean;
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
  /** Development-only Vite origin proxied through the daemon's public origin. */
  mobileDevServerUrl?: string;
  /**
   * Password a mobile client must present to `POST /api/auth/pair` to obtain an
   * independent random session token.
   */
  mobilePassword?: string;
  onShutdown?: () => void;
}
