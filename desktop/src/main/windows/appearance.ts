import type { BrowserWindowConstructorOptions } from "electron";

import type {
  DesktopConfirmDeleteArchivedChatsInput,
  DesktopConfirmDeleteCustomAgentInput,
  DesktopConfirmSaveWorkspaceFileChangesInput,
  DesktopConfirmSaveWorkspaceFileChangesResult,
  DesktopThemeMode,
} from "../../shared/desktop-window";
import { BrowserWindow, dialog, ipcMain, nativeTheme } from "electron";
import {
  DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL,
  DESKTOP_CONFIRM_DELETE_ARCHIVED_CHATS_CHANNEL,
  DESKTOP_CONFIRM_DELETE_CUSTOM_AGENT_CHANNEL,
  DESKTOP_CONFIRM_SAVE_WORKSPACE_FILE_CHANGES_CHANNEL,
  DESKTOP_INSTALL_UPDATE_CHANNEL,
  DESKTOP_THEME_SET_CHANNEL,
} from "../../shared/desktop-window";
import { translate } from "../platform/i18n";
import { installDownloadedUpdate } from "../updater";

const isMacOS = process.platform === "darwin";
const trafficLightPosition = { x: 16, y: 18 };

let didRegisterIpc = false;

export function desktopWindowChromeOptions(): BrowserWindowConstructorOptions {
  if (!isMacOS) {
    return {};
  }

  return {
    titleBarStyle: "hidden",
    trafficLightPosition,
    transparent: true,
  };
}

export function configureDesktopWindowAppearance(window: BrowserWindow) {
  if (isMacOS) {
    window.setWindowButtonPosition(trafficLightPosition);
  }
}

export function registerDesktopWindowAppearanceIpc() {
  if (didRegisterIpc) return;
  didRegisterIpc = true;

  ipcMain.on(DESKTOP_THEME_SET_CHANNEL, (_event, input: unknown) => {
    const mode = readThemeMode(input);
    if (!mode) return;

    nativeTheme.themeSource = mode;
  });

  ipcMain.handle(DESKTOP_CONFIRM_DELETE_ALL_CHATS_CHANNEL, async (event) => {
    const options = {
      buttons: [translate("common.cancel"), translate("common.delete")],
      cancelId: 0,
      defaultId: 0,
      detail: translate("settings.danger.description"),
      message: translate("settings.danger.confirmDeleteAll"),
      noLink: true,
      type: "warning" as const,
    };
    const parentWindow = BrowserWindow.fromWebContents(event.sender);
    const result = parentWindow
      ? await dialog.showMessageBox(parentWindow, options)
      : await dialog.showMessageBox(options);

    return result.response === 1;
  });

  ipcMain.handle(
    DESKTOP_CONFIRM_DELETE_ARCHIVED_CHATS_CHANNEL,
    async (event, input: unknown) => {
      const value = readConfirmDeleteArchivedChatsInput(input);
      if (!value) return false;

      const translationValues = {
        chatCount: value.chatCount,
        managedWorktreeCount: value.managedWorktreeCount,
      };
      const detail =
        value.managedWorktreeCount > 0
          ? translate(
              "settings.archived.confirmDeleteWorktreeDetail",
              translationValues,
            )
          : translate(
              "settings.archived.confirmDeleteDetail",
              translationValues,
            );
      const options = {
        buttons: [translate("common.cancel"), translate("common.delete")],
        cancelId: 0,
        defaultId: 0,
        detail,
        message: translate("settings.archived.confirmDeleteTitle"),
        noLink: true,
        type: "warning" as const,
      };
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const result = parentWindow
        ? await dialog.showMessageBox(parentWindow, options)
        : await dialog.showMessageBox(options);

      return result.response === 1;
    },
  );

  ipcMain.handle(
    DESKTOP_CONFIRM_DELETE_CUSTOM_AGENT_CHANNEL,
    async (event, input: unknown) => {
      const value = readConfirmDeleteCustomAgentInput(input);
      if (!value) return false;

      const options = {
        buttons: [translate("common.cancel"), translate("common.delete")],
        cancelId: 0,
        defaultId: 0,
        detail:
          value.chatCount > 0
            ? `This will also delete ${value.chatCount} related chat${value.chatCount === 1 ? "" : "s"}.`
            : "This custom agent is not used by any chats.",
        message: `Delete ${value.label}?`,
        noLink: true,
        type: "warning" as const,
      };
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const result = parentWindow
        ? await dialog.showMessageBox(parentWindow, options)
        : await dialog.showMessageBox(options);

      return result.response === 1;
    },
  );

  ipcMain.handle(
    DESKTOP_CONFIRM_SAVE_WORKSPACE_FILE_CHANGES_CHANNEL,
    async (event, input: unknown) => {
      const value = readConfirmSaveWorkspaceFileChangesInput(input);
      if (!value) return "cancel";

      const options = {
        buttons: [
          translate("common.save"),
          "Don't Save",
          translate("common.cancel"),
        ],
        cancelId: 2,
        defaultId: 0,
        detail: "Your changes will be lost if you don't save them.",
        message: `Save changes to ${value.path}?`,
        noLink: true,
        type: "warning" as const,
      };
      const parentWindow = BrowserWindow.fromWebContents(event.sender);
      const result = parentWindow
        ? await dialog.showMessageBox(parentWindow, options)
        : await dialog.showMessageBox(options);

      switch (result.response) {
        case 0:
          return "save" satisfies DesktopConfirmSaveWorkspaceFileChangesResult;
        case 1:
          return "discard" satisfies DesktopConfirmSaveWorkspaceFileChangesResult;
        default:
          return "cancel" satisfies DesktopConfirmSaveWorkspaceFileChangesResult;
      }
    },
  );

  ipcMain.handle(DESKTOP_INSTALL_UPDATE_CHANNEL, () => {
    installDownloadedUpdate();
  });
}

function readThemeMode(input: unknown): DesktopThemeMode | null {
  if (!isObject(input)) return null;

  switch (input.mode) {
    case "light":
    case "dark":
    case "system":
      return input.mode;
    default:
      return null;
  }
}

function isObject(value: unknown): value is { mode?: unknown } {
  return typeof value === "object" && value !== null;
}

function readConfirmDeleteArchivedChatsInput(
  input: unknown,
): DesktopConfirmDeleteArchivedChatsInput | null {
  if (typeof input !== "object" || input === null) return null;
  const value = input as Partial<DesktopConfirmDeleteArchivedChatsInput>;
  if (
    typeof value.chatCount !== "number" ||
    !Number.isFinite(value.chatCount) ||
    value.chatCount <= 0
  ) {
    return null;
  }
  if (
    typeof value.managedWorktreeCount !== "number" ||
    !Number.isFinite(value.managedWorktreeCount) ||
    value.managedWorktreeCount < 0
  ) {
    return null;
  }
  return {
    chatCount: Math.trunc(value.chatCount),
    managedWorktreeCount: Math.trunc(value.managedWorktreeCount),
  };
}

function readConfirmDeleteCustomAgentInput(
  input: unknown,
): DesktopConfirmDeleteCustomAgentInput | null {
  if (typeof input !== "object" || input === null) return null;
  const value = input as Partial<DesktopConfirmDeleteCustomAgentInput>;
  if (typeof value.label !== "string" || !value.label.trim()) return null;
  if (
    typeof value.chatCount !== "number" ||
    !Number.isFinite(value.chatCount)
  ) {
    return null;
  }
  return {
    chatCount: Math.max(0, Math.trunc(value.chatCount)),
    label: value.label,
  };
}

function readConfirmSaveWorkspaceFileChangesInput(
  input: unknown,
): DesktopConfirmSaveWorkspaceFileChangesInput | null {
  if (typeof input !== "object" || input === null) return null;
  const value = input as Partial<DesktopConfirmSaveWorkspaceFileChangesInput>;
  if (typeof value.path !== "string" || !value.path.trim()) return null;
  return { path: value.path };
}
