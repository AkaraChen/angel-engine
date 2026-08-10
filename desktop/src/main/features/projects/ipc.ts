import { tipc } from "@egoist/tipc/main";
import { dialog } from "electron";
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
};
