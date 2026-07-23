import { DaemonRequestError } from "@angel-engine/daemon-client";
import { tipc } from "@egoist/tipc/main";
import { type as arkType } from "arktype";
import { Effect } from "effect";
import { BrowserWindow, dialog } from "electron";
import { daemonClient } from "../../daemon/client";
import { MainIpcError } from "../../platform/errors";
import { translate } from "../../platform/i18n";
import { showProjectContextMenu } from "./context-menu";

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
    .action(async ({ context, input }) =>
      Effect.runPromise(
        Effect.gen(function* () {
          const projectId = arkType("string")(input);
          if (projectId instanceof arkType.errors) {
            return yield* Effect.fail(
              MainIpcError.invalidRequest("Project id is required."),
            );
          }
          const project = yield* Effect.tryPromise({
            catch: (cause) =>
              cause instanceof DaemonRequestError
                ? MainIpcError.daemonRequestFailed(cause.message)
                : MainIpcError.operationFailed(cause),
            try: () => daemonClient.projects.get(projectId),
          });
          if (project === null) {
            return yield* Effect.fail(
              MainIpcError.notFound("Project not found."),
            );
          }
          return yield* Effect.promise(() =>
            showProjectContextMenu(
              project,
              {
                delete: translate("common.delete"),
                openInFinder: translate("projects.openInFinder"),
              },
              BrowserWindow.fromWebContents(context.sender) ?? undefined,
            ),
          );
        }),
      ),
    ),
};
