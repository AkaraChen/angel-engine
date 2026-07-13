import type { DaemonTransport } from "@angel-engine/daemon-api/client";
import type { DaemonInfo } from "@angel-engine/daemon-api/daemon";

export interface RendererDaemonTransport extends DaemonTransport {
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
