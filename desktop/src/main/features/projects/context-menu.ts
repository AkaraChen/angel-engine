import type { Project } from "@angel-engine/daemon-api/projects";
import type { BrowserWindow } from "electron";
import type { PathLauncherMenuResult } from "@shared/path-launcher";

import { DaemonRequestError } from "@angel-engine/daemon-client";
import { Menu } from "electron";
import { daemonClient } from "../../daemon/client";
import { translate } from "../../platform/i18n";
import {
  buildProjectDeleteConfirmDetail,
  buildProjectDeleteConfirmMessage,
  confirmDestructiveDelete,
  projectDisplayName,
  showDestructiveBlockedNotice,
} from "../destructive-confirm";
import { createPathLauncherMenuItems } from "../path-launcher/context-menu";
import { resolvePathLauncherTarget } from "../path-launcher/target";

export type ProjectContextMenuResult =
  | PathLauncherMenuResult
  | "cancelled"
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
              void confirmAndDeleteProject(project, window).then(
                resolve,
                reject,
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

async function confirmAndDeleteProject(
  project: Project,
  window: BrowserWindow | undefined,
): Promise<"cancelled" | "deleted"> {
  const impact = await daemonClient.projects.deleteImpact(project.id);
  const name = projectDisplayName(project.path);
  const confirmed = await confirmDestructiveDelete(
    {
      detail: buildProjectDeleteConfirmDetail(impact.chatCount),
      message: buildProjectDeleteConfirmMessage(name),
    },
    window,
  );
  if (!confirmed) return "cancelled";
  try {
    await daemonClient.projects.delete({
      expectedRevision: impact.revision,
      id: project.id,
    });
  } catch (error) {
    if (
      error instanceof DaemonRequestError &&
      error.code === "project-delete-conflict"
    ) {
      // The confirmed chat set drifted; the daemon deleted nothing. Tell the
      // user visibly instead of surfacing a generic failure.
      await showDestructiveBlockedNotice(
        {
          detail: translate("projects.deleteConflictDetail"),
          message: translate("projects.deleteConflictTitle"),
        },
        window,
      );
      return "cancelled";
    }
    throw error;
  }
  return "deleted";
}
