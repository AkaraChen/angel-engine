import { startDaemonEvents, stopDaemonEvents } from "./daemon/events";
import {
  startMobileDevServer,
  stopMobileDevServer,
} from "./daemon/mobile-dev-server";
import {
  startDaemonSupervisor,
  stopDaemonSupervisor,
} from "./daemon/supervisor";
import { startTray, stopTray } from "./features/tray/service";
import { registerAllIpc } from "./ipc/register";
import { configureApplicationMenu } from "./platform/application-menu";
import { configureAutoUpdates } from "./updater";
import { createMainWindow } from "./windows/main-window";
import { openSettingsWindow } from "./windows/settings-window";

export async function bootstrap() {
  startDaemonEvents();
  await startMobileDevServer();
  await startDaemonSupervisor();
  registerAllIpc({ openSettingsWindow });
  configureApplicationMenu({ openSettingsWindow });
  configureAutoUpdates();
  startTray();
  createMainWindow();
}

export async function beforeQuit() {
  stopTray();
  stopDaemonEvents();
  await stopMobileDevServer();
  await stopDaemonSupervisor();
}
