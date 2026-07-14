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
  onShutdown?: () => void;
}
