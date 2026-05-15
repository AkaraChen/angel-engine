import { getDatabase } from "./db/client";
import { closeProjectsDatabase } from "./features/projects/repository";
import { registerAllIpc } from "./ipc/register";
import { configureApplicationMenu } from "./platform/application-menu";
import { createClaudeRuntime } from "./runtimes/claude";
import { createMainWindow } from "./windows/main-window";
import { openSettingsWindow } from "./windows/settings-window";

const chatRuntime = createClaudeRuntime();

export function bootstrap() {
  getDatabase();
  registerAllIpc({ chatRuntime, openSettingsWindow });
  configureApplicationMenu({ openSettingsWindow });
  createMainWindow();
}

export function beforeQuit() {
  chatRuntime.closeChatSession();
  closeProjectsDatabase();
}
