import { COMMAND_IDS } from "@shared/keybindings";
import type { FC, ReactNode } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import {
  KeymapScope,
  useCommand,
  useContextKey,
} from "@/platform/keymap/provider";

/**
 * Registers workspace-level command handlers for the central keymap
 * (KIT-796 first-ship command set).
 *
 * `files.save` is intentionally NOT registered here — only
 * `WorkspaceSplitFilesPanel` owns that handler so a placeholder cannot
 * shadow the real save path.
 */
export const WorkspaceKeymapBindings: FC<{
  onCreateStandaloneChat: () => void;
  onOpenSettings: () => void;
  children?: ReactNode;
}> = ({ onCreateStandaloneChat, onOpenSettings, children }) => {
  const { toggleSidebar } = useSidebar();

  useContextKey("view.id", "workspace");

  useCommand(COMMAND_IDS.workspaceToggleSidebar, () => {
    toggleSidebar();
    return true;
  }, [toggleSidebar]);

  useCommand(COMMAND_IDS.chatNew, () => {
    onCreateStandaloneChat();
    return true;
  }, [onCreateStandaloneChat]);

  useCommand(COMMAND_IDS.settingsOpen, () => {
    onOpenSettings();
    return true;
  }, [onOpenSettings]);

  useCommand(COMMAND_IDS.chatFocusComposer, () => {
    const el = document.querySelector<HTMLElement>(
      '[data-keymap-capture="chat.composer"] [contenteditable="true"], [data-composer-root] [contenteditable="true"]',
    );
    el?.focus();
    return Boolean(el);
  }, []);

  return (
    <KeymapScope scope="view" id="workspace">
      {children}
    </KeymapScope>
  );
};
