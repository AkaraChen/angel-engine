import type { MenuItemConstructorOptions } from "electron";
import type { DesktopWindowCommand } from "../../shared/desktop-window";

import { app, BrowserWindow, Menu } from "electron";
import { DESKTOP_COMMAND_CHANNEL } from "../../shared/desktop-window";
import { translate } from "./i18n";

const isMacOS = process.platform === "darwin";

export function configureApplicationMenu({
  openSettingsWindow,
}: {
  openSettingsWindow: () => void;
}) {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(menuTemplate({ openSettingsWindow })),
  );
}

function menuTemplate({
  openSettingsWindow,
}: {
  openSettingsWindow: () => void;
}): MenuItemConstructorOptions[] {
  return [
    ...(isMacOS
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              settingsItem(
                openSettingsWindow,
                translate("workspace.settings"),
                ",",
              ),
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : []),
    {
      label: translate("common.file"),
      submenu: [
        commandItem("new-chat", translate("workspace.newChat"), "CmdOrCtrl+N"),
        ...(!isMacOS
          ? [
              { type: "separator" } satisfies MenuItemConstructorOptions,
              settingsItem(
                openSettingsWindow,
                translate("workspace.settings"),
                "Ctrl+,",
              ),
              { type: "separator" } satisfies MenuItemConstructorOptions,
              { role: "quit" } satisfies MenuItemConstructorOptions,
            ]
          : []),
      ],
    },
    {
      label: translate("common.edit"),
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        commandItem(
          "toggle-sidebar",
          translate("sidebar.toggleSidebar"),
          "CmdOrCtrl+B",
        ),
        { type: "separator" },
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMacOS
          ? [
              { type: "separator" } satisfies MenuItemConstructorOptions,
              { role: "front" } satisfies MenuItemConstructorOptions,
              { type: "separator" } satisfies MenuItemConstructorOptions,
              { role: "window" } satisfies MenuItemConstructorOptions,
            ]
          : [{ role: "close" } satisfies MenuItemConstructorOptions]),
      ],
    },
    {
      role: "help",
      submenu: [],
    },
  ];
}

function settingsItem(
  openSettingsWindow: () => void,
  label: string,
  accelerator: string,
): MenuItemConstructorOptions {
  return {
    accelerator,
    click: openSettingsWindow,
    label,
  };
}

function commandItem(
  command: DesktopWindowCommand,
  label: string,
  accelerator: string,
): MenuItemConstructorOptions {
  return {
    accelerator,
    click: () => {
      sendCommand(command);
    },
    label,
  };
}

function sendCommand(command: DesktopWindowCommand) {
  const window =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  window?.webContents.send(DESKTOP_COMMAND_CHANNEL, { command });
}
