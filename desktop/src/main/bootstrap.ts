import { getDatabase } from "./db/client";
import {
  startDaemonSupervisor,
  stopDaemonSupervisor,
} from "./daemon/supervisor";
import { createChatRuntime } from "./features/chat/engine-runtime";
import { closeProjectsDatabase } from "./features/projects/repository";
import { registerAllIpc } from "./ipc/register";
import { configureApplicationMenu } from "./platform/application-menu";
import { configureAutoUpdates } from "./updater";
import { createMainWindow } from "./windows/main-window";
import { openSettingsWindow } from "./windows/settings-window";

const chatRuntime = createChatRuntime();

export async function bootstrap() {
  getDatabase();
  registerAllIpc({ chatRuntime, openSettingsWindow });
  await startDaemonSupervisor();
  configureApplicationMenu({ openSettingsWindow });
  configureAutoUpdates();
  createMainWindow();
}

export async function beforeQuit() {
  await stopDaemonSupervisor();
  chatRuntime.closeChatSession();
  closeProjectsDatabase();
}
