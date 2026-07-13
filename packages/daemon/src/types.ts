export interface DaemonOptions {
  dataDir: string;
  migrationsDir?: string;
  packaged?: boolean;
  host?: string;
  port?: number;
  token?: string;
  version?: string;
  onShutdown?: () => void;
}
