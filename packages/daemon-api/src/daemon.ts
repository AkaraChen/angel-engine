import type {
  ListeningPortInfo,
  SubprocessInfo,
} from "@angel-engine/client-napi";

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

export interface ProcessRegistryEntry {
  id: string;
  label: string;
  rootPid: number;
}

export interface ProcessRegistrySnapshotEntry extends ProcessRegistryEntry {
  processes: SubprocessInfo[];
  ports: ListeningPortInfo[];
}
