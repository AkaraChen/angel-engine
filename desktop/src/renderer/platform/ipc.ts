import type { AppRouter } from "@main/ipc/router";

import { createClient } from "@egoist/tipc/renderer";

export const ipc = createClient<AppRouter>({
  ipcInvoke: window.tipc.invoke,
});
