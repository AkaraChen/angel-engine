import type {
  WorkspaceToolGitCommitInput,
  WorkspaceToolReadFileInput,
  WorkspaceToolRootInput,
  WorkspaceToolWriteFileInput,
} from "../../../shared/workspace-tools";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import {
  workspaceFileTree,
  workspaceGitCommit,
  workspaceGitDiff,
  workspaceReadFile,
  workspaceWriteFile,
} from "./service";

const t = tipc.create();

const workspaceToolRootInput = arkType({
  "+": "ignore",
  root: "string > 0",
});

const workspaceToolReadFileInput = arkType({
  "+": "ignore",
  path: "string > 0",
  root: "string > 0",
});

const workspaceToolWriteFileInput = arkType({
  "+": "ignore",
  content: "string",
  path: "string > 0",
  root: "string > 0",
});

export const workspaceToolsIpcRouter = {
  workspaceToolsFileTree: t.procedure
    .input<WorkspaceToolRootInput>()
    .action(async ({ input }) => {
      const value = workspaceToolRootInput(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Workspace root is required.");
      }
      return workspaceFileTree(value.root);
    }),

  workspaceToolsGitDiff: t.procedure
    .input<WorkspaceToolRootInput>()
    .action(async ({ input }) => {
      const value = workspaceToolRootInput(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Workspace root is required.");
      }
      return workspaceGitDiff(value.root);
    }),

  workspaceToolsGitCommit: t.procedure
    .input<WorkspaceToolGitCommitInput>()
    .action(async ({ input }) => {
      if (
        !input ||
        typeof input.root !== "string" ||
        input.root.length === 0 ||
        typeof input.summary !== "string" ||
        !Array.isArray(input.paths) ||
        input.paths.some((path) => typeof path !== "string")
      ) {
        throw new TypeError(
          "Workspace root, selected paths, and commit summary are required.",
        );
      }

      return workspaceGitCommit({
        description:
          typeof input.description === "string" ? input.description : undefined,
        paths: input.paths,
        root: input.root,
        summary: input.summary,
      });
    }),

  workspaceToolsReadFile: t.procedure
    .input<WorkspaceToolReadFileInput>()
    .action(async ({ input }) => {
      const value = workspaceToolReadFileInput(input);
      if (value instanceof arkType.errors) {
        throw new TypeError("Workspace root and file path are required.");
      }
      return workspaceReadFile(value.root, value.path);
    }),

  workspaceToolsWriteFile: t.procedure
    .input<WorkspaceToolWriteFileInput>()
    .action(async ({ input }) => {
      const value = workspaceToolWriteFileInput(input);
      if (value instanceof arkType.errors) {
        throw new TypeError(
          "Workspace root, file path, and content are required.",
        );
      }
      return workspaceWriteFile(value.root, value.path, value.content);
    }),
};
