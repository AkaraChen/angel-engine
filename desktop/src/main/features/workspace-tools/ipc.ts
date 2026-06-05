import type { WorkspaceToolRootInput } from "../../../shared/workspace-tools";
import { tipc } from "@egoist/tipc/main";

import { type as arkType } from "arktype";
import { workspaceFileTree, workspaceGitDiff } from "./service";

const t = tipc.create();

const workspaceToolRootInput = arkType({
  "+": "ignore",
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
};
