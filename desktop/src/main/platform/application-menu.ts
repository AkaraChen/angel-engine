import type { MenuItemConstructorOptions } from "electron";
import type { DesktopWindowCommand } from "../../shared/desktop-window";

import { app, Menu } from "electron";
import { DESKTOP_COMMAND_CHANNEL } from "../../shared/desktop-window";
import {
  COMMAND_IDS,
  acceleratorForCommand,
  detectKeymapPlatform,
} from "../../shared/keybindings";
import { checkForUpdatesFromMenu } from "../updater";
import { ensureMainWindow } from "../windows/main-window";
import { translate } from "./i18n";
import { getKeybindingsState } from "./keybindings-store";

const isMacOS = process.platform === "darwin";

let openSettingsWindowRef: (() => void) | null = null;

export function configureApplicationMenu({
  openSettingsWindow,
}: {
  openSettingsWindow: () => void;
}) {
  openSettingsWindowRef = openSettingsWindow;
  rebuildApplicationMenu();
}

/** Rebuild the menu so accelerators and translated labels stay current. */
export function rebuildApplicationMenu() {
  if (!openSettingsWindowRef) return;
  const openSettingsWindow = openSettingsWindowRef;
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(menuTemplate({ openSettingsWindow })),
  );
}

function acceleratorFor(commandId: string): string | undefined {
  const state = getKeybindingsState();
  return acceleratorForCommand(commandId, {
    userEntries: state.file.bindings,
    platform: detectKeymapPlatform(process.platform),
  });
}

function menuTemplate({
  openSettingsWindow,
}: {
  openSettingsWindow: () => void;
}): MenuItemConstructorOptions[] {
  // No hard-coded fallback: unbind / chord-only must clear the menu shortcut.
  const settingsAccel = acceleratorFor(COMMAND_IDS.settingsOpen);
  const newChatAccel = acceleratorFor(COMMAND_IDS.chatNew);
  const sidebarAccel = acceleratorFor(COMMAND_IDS.workspaceToggleSidebar);

  return [
    ...(isMacOS
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              updateItem(),
              { type: "separator" },
              settingsItem(
                openSettingsWindow,
                translate("workspace.settings"),
                settingsAccel,
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
        commandItem("new-chat", translate("workspace.newChat"), newChatAccel),
        ...(!isMacOS
          ? [
              { type: "separator" } satisfies MenuItemConstructorOptions,
              settingsItem(
                openSettingsWindow,
                translate("workspace.settings"),
                settingsAccel,
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
      label: translate("menu.view"),
      submenu: [
        commandItem(
          "toggle-sidebar",
          translate("sidebar.toggleSidebar"),
          sidebarAccel,
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
      label: translate("menu.window"),
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
      submenu: !isMacOS
        ? [{ role: "about" } satisfies MenuItemConstructorOptions, updateItem()]
        : [],
    },
  ];
}

function settingsItem(
  openSettingsWindow: () => void,
  label: string,
  accelerator: string | undefined,
): MenuItemConstructorOptions {
  return {
    ...(accelerator ? { accelerator } : {}),
    click: openSettingsWindow,
    label,
  };
}

function commandItem(
  command: DesktopWindowCommand,
  label: string,
  accelerator: string | undefined,
): MenuItemConstructorOptions {
  return {
    ...(accelerator ? { accelerator } : {}),
    click: () => {
      sendCommand(command);
    },
    label,
  };
}

function updateItem(): MenuItemConstructorOptions {
  return {
    click: checkForUpdatesFromMenu,
    label: translate("updates.checkForUpdates"),
  };
}

function sendCommand(command: DesktopWindowCommand) {
  const window = ensureMainWindow();
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
  app.focus({ steal: true });
  window.webContents.send(DESKTOP_COMMAND_CHANNEL, { command });
}
