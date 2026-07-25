import type { BrowserWindow, MenuItemConstructorOptions } from "electron";
import type {
  PathLauncherMenuResult,
  PathLauncherTargetRef,
} from "@shared/path-launcher";
import { Menu } from "electron";
import { translate } from "../../platform/i18n";
import { pathLauncher } from "./runtime";
import { resolvePathLauncherTarget } from "./target";

type SelectPathLauncherAction = (
  action: Promise<PathLauncherMenuResult>,
) => void;

function fileManagerLabel(): string {
  if (process.platform === "darwin") {
    return translate("pathLauncher.openInFinder");
  }
  if (process.platform === "win32") {
    return translate("pathLauncher.openInFileExplorer");
  }
  return translate("pathLauncher.openInFileManager");
}

export async function createPathLauncherMenuItems(
  target: string,
  select: SelectPathLauncherAction,
  options: { includeAngelTerminal?: boolean } = {},
): Promise<MenuItemConstructorOptions[]> {
  const availability = await pathLauncher.availability();
  const items: MenuItemConstructorOptions[] = availability.editors.map(
    (editor) => ({
      click: () =>
        select(
          pathLauncher
            .launchEditor(editor.id, target)
            .then(() => "opened" as const),
        ),
      label: translate("pathLauncher.openInEditor", { editor: editor.name }),
    }),
  );

  if (items.length > 0) items.push({ type: "separator" });
  items.push({
    click: () =>
      select(pathLauncher.launchFileManager(target).then(() => "opened")),
    label: fileManagerLabel(),
  });
  if (availability.systemTerminal) {
    items.push({
      click: () =>
        select(pathLauncher.launchSystemTerminal(target).then(() => "opened")),
      label: translate("pathLauncher.openInSystemTerminal"),
    });
  }
  if (options.includeAngelTerminal === true) {
    items.push({
      click: () =>
        select(
          Promise.resolve({
            action: "open_angel_terminal",
            target,
          }),
        ),
      label: translate("pathLauncher.openInAngelTerminal"),
    });
  }
  items.push({
    click: () =>
      select(
        Promise.resolve().then(() => {
          pathLauncher.copyPath(target);
          return "copied";
        }),
      ),
    label: translate("pathLauncher.copyPath"),
  });
  return items;
}

export async function showPathLauncherContextMenu(
  ref: PathLauncherTargetRef,
  window: BrowserWindow | undefined,
  options: { includeAngelTerminal?: boolean } = {},
): Promise<PathLauncherMenuResult> {
  const target = await resolvePathLauncherTarget(ref);
  return new Promise((resolve, reject) => {
    let handled = false;
    const select: SelectPathLauncherAction = (action) => {
      handled = true;
      void action.then(resolve, reject);
    };

    void createPathLauncherMenuItems(target, select, options).then(
      (template) => {
        const menu = Menu.buildFromTemplate(template);
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
