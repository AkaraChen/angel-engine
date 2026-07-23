import type { Project } from "@angel-engine/daemon-api/projects";
import type { BrowserWindow } from "electron";

import { Menu, shell } from "electron";
import { daemonClient } from "../../daemon/client";

export type ProjectContextMenuResult = "cancelled" | "deleted" | "opened";

interface ProjectContextMenuLabels {
  delete: string;
  openInFinder: string;
}

export function showProjectContextMenu(
  project: Project,
  labels: ProjectContextMenuLabels,
  window: BrowserWindow | undefined,
): Promise<ProjectContextMenuResult> {
  return new Promise((resolve, reject) => {
    let handled = false;
    const menu = Menu.buildFromTemplate([
      {
        click: () => {
          handled = true;
          void shell.openPath(project.path).then(
            () => resolve("opened"),
            (error: unknown) => reject(error),
          );
        },
        label: labels.openInFinder,
      },
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
  });
}
