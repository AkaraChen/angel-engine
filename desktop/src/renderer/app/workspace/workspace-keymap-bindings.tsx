import { COMMAND_IDS } from "@shared/keybindings";
import type { FC } from "react";

import { useSidebar } from "@/components/ui/sidebar";
import {
  KeymapScope,
  useCommand,
  useContextKey,
} from "@/platform/keymap/provider";

/**
 * Registers workspace-level command handlers for the central keymap
 * (KIT-796 first-ship command set).
 */
export const WorkspaceKeymapBindings: FC<{
  onCreateStandaloneChat: () => void;
  onOpenSettings: () => void;
  powerModeActive?: boolean;
  hasClosableTab?: boolean;
  hasMultipleTabs?: boolean;
  onNewTab?: () => void;
  onCloseTab?: () => void;
  onNextTab?: () => void;
  onPreviousTab?: () => void;
  filesActiveDirty?: boolean;
  onSaveFile?: () => void;
  children?: React.ReactNode;
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
  filesActiveDirty = false,
  onSaveFile,
  children,
}) => {
  const { toggleSidebar } = useSidebar();

  useContextKey("view.id", "workspace");
  useContextKey("workspace.powerMode", powerModeActive);
  useContextKey("workspace.hasClosableTab", hasClosableTab);
  useContextKey("workspace.hasMultipleTabs", hasMultipleTabs);
  useContextKey("files.activeDirty", filesActiveDirty);

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
    onNextTab();
    return true;
  }, [hasMultipleTabs, onNextTab]);

  useCommand(COMMAND_IDS.workspacePreviousTab, () => {
    if (!hasMultipleTabs || !onPreviousTab) return false;
    onPreviousTab();
    return true;
  }, [hasMultipleTabs, onPreviousTab]);

  useCommand(COMMAND_IDS.filesSave, () => {
    if (!filesActiveDirty || !onSaveFile) return false;
    onSaveFile();
    return true;
  }, [filesActiveDirty, onSaveFile]);

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
