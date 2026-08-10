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
  powerModeActive?: boolean;
  hasClosableTab?: boolean;
  hasMultipleTabs?: boolean;
  onNewTab?: () => void;
  onCloseTab?: () => void;
  onNextTab?: () => boolean | void;
  onPreviousTab?: () => boolean | void;
  children?: ReactNode;
}> = ({
  onCreateStandaloneChat,
  onOpenSettings,
  powerModeActive = false,
  hasClosableTab = false,
  hasMultipleTabs = false,
  onNewTab,
  onCloseTab,
  onNextTab,
  onPreviousTab,
  children,
}) => {
  const { toggleSidebar } = useSidebar();

  useContextKey("view.id", "workspace");
  useContextKey("workspace.powerMode", powerModeActive);
  useContextKey("workspace.hasClosableTab", hasClosableTab);
  useContextKey("workspace.hasMultipleTabs", hasMultipleTabs);

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

  useCommand(COMMAND_IDS.workspaceNewTab, () => {
    if (!powerModeActive || !onNewTab) return false;
    onNewTab();
    return true;
  }, [powerModeActive, onNewTab]);

  useCommand(COMMAND_IDS.workspaceCloseTab, () => {
    if (!powerModeActive || !hasClosableTab || !onCloseTab) return false;
    onCloseTab();
    return true;
  }, [powerModeActive, hasClosableTab, onCloseTab]);

  useCommand(COMMAND_IDS.workspaceNextTab, () => {
    if (!hasMultipleTabs || !onNextTab) return false;
    // goToNextTab returns false when there is nothing to switch to.
    const result = onNextTab();
    return result === false ? false : true;
  }, [hasMultipleTabs, onNextTab]);

  useCommand(COMMAND_IDS.workspacePreviousTab, () => {
    if (!hasMultipleTabs || !onPreviousTab) return false;
    const result = onPreviousTab();
    return result === false ? false : true;
  }, [hasMultipleTabs, onPreviousTab]);

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
