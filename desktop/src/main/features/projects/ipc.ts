import { BrowserWindow, dialog, Menu, shell } from "electron";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";

import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../../../shared/projects";
import type { ProjectFileSearchInput } from "../../../shared/chat";
import { searchProjectFiles } from "./file-search";
import {
  createProjectInput,
  projectFileSearchInput,
  updateProjectInput,
} from "./schemas";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject,
} from "./repository";
import { translate } from "../../i18n";

const t = tipc.create();

export const projectIpcRouter = {
  projectsChooseDirectory: t.procedure.action(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title: translate("projects.chooseFolder"),
    });

    return result.canceled ? null : result.filePaths[0];
  }),

  projectsCreate: t.procedure
    .input<CreateProjectInput>()
    .action(async ({ input }) => {
      const value = createProjectInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Project input is required.");
      }
      return createProject({
        id: value.id,
        path: value.path,
      });
    }),

  projectsDelete: t.procedure.input<string>().action(async ({ input }) => {
    const value = arkType("string")(input);
    if (value instanceof arkType.errors) {
      throw new Error("Project id is required.");
    }
    return deleteProject(value);
  }),

  projectsGet: t.procedure.input<string>().action(async ({ input }) => {
    const value = arkType("string")(input);
    if (value instanceof arkType.errors) {
      throw new Error("Project id is required.");
    }
    return getProject(value);
  }),

  projectsList: t.procedure.action(async () => listProjects()),

  projectsSearchFiles: t.procedure
    .input<ProjectFileSearchInput>()
    .action(async ({ input }) => {
      const value = projectFileSearchInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Project file search input is required.");
      }
      const query = {
        limit:
          typeof value.limit === "number" && Number.isFinite(value.limit)
            ? value.limit
            : undefined,
        query: value.query,
        root: value.root,
      };
      return searchProjectFiles(query);
    }),

  projectsShowContextMenu: t.procedure
    .input<string>()
    .action(async ({ context, input }) => {
      const projectId = arkType("string")(input);
      if (projectId instanceof arkType.errors) {
        throw new Error("Project id is required.");
      }
      const project = getProject(projectId);
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
            label: translate("projects.openInFinder"),
          },
          { type: "separator" },
          {
            click: () => {
              deleteProject(project.id);
              resolve("deleted");
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

  projectsUpdate: t.procedure
    .input<UpdateProjectInput>()
    .action(async ({ input }) => {
      const value = updateProjectInput(input);
      if (value instanceof arkType.errors) {
        throw new Error("Project input is required.");
      }
      return updateProject({
        id: value.id,
        path: value.path,
      });
    }),
};
