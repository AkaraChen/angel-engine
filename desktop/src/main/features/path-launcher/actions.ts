import type {
  PathLauncherActionId,
  PathLauncherAvailabilitySnapshot,
  PathLauncherMenuResult,
  PathLauncherTargetRef,
} from "@shared/path-launcher";

import { pathLauncher } from "./runtime";
import { resolvePathLauncherTarget } from "./target";

export async function pathLauncherAvailabilitySnapshot(): Promise<PathLauncherAvailabilitySnapshot> {
  const availability = await pathLauncher.availability();
  return {
    editors: availability.editors.map(({ id, name }) => ({ id, name })),
    systemTerminal: availability.systemTerminal,
  };
}

/**
 * Runs the action a renderer-side path-launcher menu item picked. Target
 * resolution stays here so the renderer never has to know a filesystem path.
 */
export async function invokePathLauncherAction(
  ref: PathLauncherTargetRef,
  action: PathLauncherActionId,
): Promise<PathLauncherMenuResult> {
  const target = await resolvePathLauncherTarget(ref);

  if (action === "angelTerminal") {
    return { action: "open_angel_terminal", target };
  }
  if (action === "copyPath") {
    pathLauncher.copyPath(target);
    return "copied";
  }
  if (action === "fileManager") {
    await pathLauncher.launchFileManager(target);
    return "opened";
  }
  if (action === "systemTerminal") {
    await pathLauncher.launchSystemTerminal(target);
    return "opened";
  }

  const editorId = action.slice("editor:".length);
  const { editors } = await pathLauncher.availability();
  const editor = editors.find((candidate) => candidate.id === editorId);
  if (editor === undefined) {
    throw new Error(`Editor "${editorId}" is not available.`);
  }
  await pathLauncher.launchEditor(editor.id, target);
  return "opened";
}
