import type { KeybindingsFile } from "../../../shared/keybindings";
import { tipc } from "@egoist/tipc/main";

import {
  getKeybindingsState,
  openKeybindingsInEditor,
  resetAllKeybindings,
  restoreKeybindingsBackup,
  setKeybindingsFile,
} from "../../platform/keybindings-store";

const t = tipc.create();

export const keybindingsPlatformIpcRouter = {
  keymapGetUserBindings: t.procedure.action(async () => getKeybindingsState()),
  keymapSetUserBindings: t.procedure
    .input<KeybindingsFile>()
    .action(async ({ input }) => setKeybindingsFile(input)),
  keymapResetAll: t.procedure.action(async () => resetAllKeybindings()),
  keymapRestoreBackup: t.procedure.action(async () =>
    restoreKeybindingsBackup(),
  ),
  keymapOpenInEditor: t.procedure.action(async () => {
    openKeybindingsInEditor();
  }),
};
