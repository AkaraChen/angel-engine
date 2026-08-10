import { startDaemonEvents, stopDaemonEvents } from "./daemon/events";
import {
  startMobileDevServer,
  stopMobileDevServer,
} from "./daemon/mobile-dev-server";
import {
  startDaemonSupervisor,
  stopDaemonSupervisor,
} from "./daemon/supervisor";
import { registerAllIpc } from "./ipc/register";
import { configureApplicationMenu } from "./platform/application-menu";
import {
  loadKeybindingsFromDisk,
  startKeybindingsWatcher,
  stopKeybindingsWatcher,
} from "./platform/keybindings-store";
import { configureAutoUpdates } from "./updater";
import { createMainWindow } from "./windows/main-window";
import { openSettingsWindow } from "./windows/settings-window";

export async function bootstrap() {
  startDaemonEvents();
  await startMobileDevServer();
  await startDaemonSupervisor();
  registerAllIpc({ openSettingsWindow });
  loadKeybindingsFromDisk();
  startKeybindingsWatcher();
  configureApplicationMenu({ openSettingsWindow });
  configureAutoUpdates();
  createMainWindow();
}

export async function beforeQuit() {
  stopKeybindingsWatcher();
  stopDaemonEvents();
  await stopMobileDevServer();
  await stopDaemonSupervisor();
}
