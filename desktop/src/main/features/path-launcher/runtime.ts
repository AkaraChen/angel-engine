import { spawn } from "node:child_process";
import { clipboard, shell } from "electron";
import { pathLauncherAdapterForPlatform } from "./adapters";
import { systemDiscoveryProbe } from "./probe";
import { PathLauncherService } from "./service";

export const pathLauncher = new PathLauncherService({
  adapter: pathLauncherAdapterForPlatform(process.platform),
  execution: {
    copyText: (text) => clipboard.writeText(text),
    openPath: (target) => shell.openPath(target),
    spawn,
  },
  probe: systemDiscoveryProbe,
});

export async function prewarmPathLauncher(): Promise<void> {
  await pathLauncher.prewarm();
}
