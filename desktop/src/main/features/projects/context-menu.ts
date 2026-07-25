import type { Project } from "@angel-engine/daemon-api/projects";
import type { BrowserWindow } from "electron";
import type { PathLauncherMenuResult } from "@shared/path-launcher";

import { Menu } from "electron";
import { daemonClient } from "../../daemon/client";
import { createPathLauncherMenuItems } from "../path-launcher/context-menu";

export type ProjectContextMenuResult = PathLauncherMenuResult | "deleted";

interface ProjectContextMenuLabels {
  delete: string;
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
    void createPathLauncherMenuItems(project.path, select).then(
      (launcherItems) => {
        const menu = Menu.buildFromTemplate([
          ...launcherItems,
          { type: "separator" },
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
      },
      reject,
    );
  });
}
