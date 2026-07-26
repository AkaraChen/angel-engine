import type { Project } from "@angel-engine/daemon-api/projects";
import type { BrowserWindow } from "electron";
import type { PathLauncherMenuResult } from "@shared/path-launcher";

import { Menu } from "electron";
import { daemonClient } from "../../daemon/client";
import { createPathLauncherMenuItems } from "../path-launcher/context-menu";
import { resolvePathLauncherTarget } from "../path-launcher/target";

export type ProjectContextMenuResult =
  | PathLauncherMenuResult
  | "deleted"
  | "settings";

interface ProjectContextMenuLabels {
  delete: string;
  settings: string;
}

export async function showProjectContextMenu(
  project: Project,
  labels: ProjectContextMenuLabels,
  window: BrowserWindow | undefined,
): Promise<ProjectContextMenuResult> {
  return new Promise((resolve, reject) => {
    let handled = false;
    const select = (action: Promise<PathLauncherMenuResult>) => {
      handled = true;
      void action.then(resolve, reject);
    };
    void resolvePathLauncherTarget({ projectId: project.id })
      .then((target) => createPathLauncherMenuItems(target, select))
      .catch(() => [])
      .then((launcherItems) => {
        const menu = Menu.buildFromTemplate([
          ...launcherItems,
          ...(launcherItems.length > 0 ? [{ type: "separator" as const }] : []),
          {
            click: () => {
              handled = true;
              resolve("settings");
            },
            label: labels.settings,
          },
          { type: "separator" as const },
          {
            click: () => {
              handled = true;
              void daemonClient.projects.delete(project.id).then(
                () => resolve("deleted"),
                (error: unknown) => reject(error),
              );
            },
            label: labels.delete,
          },
        ]);
        menu.popup({
          callback: () => {
            if (!handled) resolve("cancelled");
          },
          window,
        });
      });
  });
}
