import type { Project } from "@angel-engine/daemon-api/projects";

import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { BrowserWindow, dialog, Menu, shell } from "electron";
import { daemonJson } from "../../daemon/client";
import { translate } from "../../platform/i18n";

const t = tipc.create();

export const projectPlatformIpcRouter = {
  projectsChooseDirectory: t.procedure.action(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: translate("projects.chooseFolder"),
    });
    return result.canceled ? null : result.filePaths[0];
  }),
  projectsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const projectId = arkType("string")(input);
      if (projectId instanceof arkType.errors)
        throw new TypeError("Project id is required.");
      const project = await daemonJson<Project | null>(
        `/api/projects/${encodeURIComponent(projectId)}`,
      );
      if (project === null) throw new Error("Project not found.");
      return new Promise<"cancelled" | "deleted" | "opened">((resolve) => {
        const menu = Menu.buildFromTemplate([
          {
            click: () => {
              void shell
                .openPath(project.path)
                .finally(() => resolve("opened"));
            },
            label: translate("projects.openInFinder"),
          },
          { type: "separator" },
          {
            click: () => {
              void daemonJson(
                `/api/projects/${encodeURIComponent(project.id)}`,
                { method: "DELETE" },
              ).then(() => resolve("deleted"));
            },
            label: translate("common.delete"),
          },
        ]);
        menu.popup({
          callback: () => resolve("cancelled"),
          window: BrowserWindow.fromWebContents(context.sender) ?? undefined,
        });
      });
    }),
};
