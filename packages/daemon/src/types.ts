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
  onShutdown?: () => void;
}
