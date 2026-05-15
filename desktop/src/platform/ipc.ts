import type { AppRouter } from "../main/router";

import { createClient } from "@egoist/tipc/renderer";

export const ipc = createClient<AppRouter>({
  ipcInvoke: window.ipcInvoke,
});
