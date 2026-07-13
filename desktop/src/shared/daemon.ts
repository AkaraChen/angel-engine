import type { DaemonInfo } from "@angel-engine/daemon";

export const DAEMON_INFO_CHANNEL = "daemon:info";
export const DAEMON_CHANGED_CHANNEL = "daemon:changed";

export type DaemonConnection =
  | { status: "available"; info: DaemonInfo }
  | { status: "unavailable"; error: string };

export interface DaemonApi {
  getInfo: () => Promise<DaemonConnection>;
  onChanged: (handler: (connection: DaemonConnection) => void) => () => void;
}
