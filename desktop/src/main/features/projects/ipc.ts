import { BrowserWindow, dialog, Menu, shell } from "electron";
import { tipc } from "@egoist/tipc/main";

import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../../../shared/projects";
import type { ProjectFileSearchInput } from "../../../shared/chat";
import { searchProjectFiles } from "./file-search";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./repository";
import {
  parseCreateProjectInput,
  parseProjectFileSearchInput,
  parseProjectId,
  parseUpdateProjectInput,
} from "./input-schemas";

const t = tipc.create();

export const projectIpcRouter = {
  projectsChooseDirectory: t.procedure.action(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: "Choose project folder",
    });

    return result.canceled ? null : result.filePaths[0];
  }),

  projectsCreate: t.procedure
    .input<CreateProjectInput>()
    .action(async ({ input }) => createProject(parseCreateProjectInput(input))),

  projectsDelete: t.procedure
    .input<string>()
    .action(async ({ input }) => deleteProject(parseProjectId(input))),

  projectsGet: t.procedure
    .input<string>()
    .action(async ({ input }) => getProject(parseProjectId(input))),

  projectsList: t.procedure.action(async () => listProjects()),

  projectsSearchFiles: t.procedure
    .input<ProjectFileSearchInput>()
    .action(async ({ input }) =>
      searchProjectFiles(parseProjectFileSearchInput(input)),
    ),

  projectsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const project = getProject(parseProjectId(input));
      if (!project) {
        throw new Error("Project not found.");
      }

      return new Promise<"cancelled" | "deleted" | "opened">((resolve) => {
        const menu = Menu.buildFromTemplate([
          {
            click: async () => {
              await shell.openPath(project.path);
              resolve("opened");
            },
            label: "Open in Finder",
          },
          { type: "separator" },
          {
            click: () => {
              deleteProject(project.id);
              resolve("deleted");
            },
            label: "Delete",
          },
        ]);

        menu.popup({
          callback: () => resolve("cancelled"),
          window: BrowserWindow.fromWebContents(context.sender) ?? undefined,
        });
      });
    }),

  projectsUpdate: t.procedure
    .input<UpdateProjectInput>()
    .action(async ({ input }) => updateProject(parseUpdateProjectInput(input))),
};
