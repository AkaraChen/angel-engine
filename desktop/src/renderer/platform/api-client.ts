import { createDaemonClient } from "@angel-engine/daemon-client";
import type { PathLauncherInvokeRequest } from "@shared/path-launcher";
import { getDaemonTransport } from "@/platform/daemon-transport";
import { ipc } from "@/platform/ipc";

export function getApiClient() {
  const daemon = createDaemonClient({
    baseUrl: "",
    fetch: async (pathname, init) => getDaemonTransport().fetch(pathname, init),
  });
  return {
    ...daemon,
    projects: {
      ...daemon.projects,
      chooseDirectory: async () => ipc.projectsChooseDirectory(),
    },
    pathLauncher: {
      availability: async () => ipc.pathLauncherAvailability(),
      invoke: async (request: PathLauncherInvokeRequest) =>
        ipc.pathLauncherInvoke(request),
    },
  };
}

export type ApiClient = ReturnType<typeof getApiClient>;
