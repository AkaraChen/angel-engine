import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";

export interface RendererDaemonTransport {
  fetch: (pathname: string, init?: RequestInit) => Promise<Response>;
  info: DaemonInfo;
}

let activeTransport: RendererDaemonTransport | undefined;

export function setDaemonTransport(
  transport: RendererDaemonTransport | undefined,
) {
  activeTransport = transport;
}

export function getDaemonTransport() {
  if (activeTransport === undefined) throw new Error("Backend is unavailable.");
  return activeTransport;
}
