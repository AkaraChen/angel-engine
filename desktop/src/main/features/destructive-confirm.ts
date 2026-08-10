import type { BrowserWindow, MessageBoxOptions } from "electron";

import { dialog } from "electron";
import { translate } from "../platform/i18n";

export type TranslateFn = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/** Last path segment for project paths; falls back to the raw path. */
export function projectDisplayName(projectPath: string): string {
  const parts = projectPath.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? projectPath;
}

/**
 * Default chat titles are stored as the English sentinel `"New chat"` (or empty
 * for unnamed). Localize at display time so confirmations match the UI.
 */
export function displayChatTitleForConfirm(
  title: string,
  t: TranslateFn = translate,
): string {
  if (!title.trim() || title === "New chat") {
    return t("workspace.newChat");
  }
  return title;
}

export function buildProjectDeleteConfirmMessage(
  name: string,
  t: TranslateFn = translate,
): string {
  return t("projects.confirmDeleteTitle", { name });
}

export function buildProjectDeleteConfirmDetail(
  chatCount: number,
  t: TranslateFn = translate,
): string {
  if (chatCount === 0) {
    return t("projects.confirmDeleteDetailNone");
  }
  if (chatCount === 1) {
    return t("projects.confirmDeleteDetailOne");
  }
  return t("projects.confirmDeleteDetail", { count: chatCount });
}

export function buildChatDeleteConfirmMessage(
  title: string,
  t: TranslateFn = translate,
): string {
  return t("dialog.confirmDeleteChatTitle", {
    title: displayChatTitleForConfirm(title, t),
  });
}

export function buildChatDeleteConfirmDetail(
  t: TranslateFn = translate,
): string {
  return t("dialog.confirmDeleteChatDetail");
}

export function destructiveConfirmMessageBoxOptions(input: {
  detail: string;
  message: string;
  t?: TranslateFn;
}): MessageBoxOptions {
  const t = input.t ?? translate;
  return {
    buttons: [t("common.cancel"), t("common.delete")],
    cancelId: 0,
    defaultId: 0,
    detail: input.detail,
    message: input.message,
    noLink: true,
    type: "warning",
  };
}

/** Cancel is default (index 0); Delete is index 1. Escape uses cancelId. */
export async function confirmDestructiveDelete(
  input: { detail: string; message: string },
  parentWindow: BrowserWindow | undefined,
): Promise<boolean> {
  const options = destructiveConfirmMessageBoxOptions(input);
  const result = parentWindow
    ? await dialog.showMessageBox(parentWindow, options)
    : await dialog.showMessageBox(options);
  return result.response === 1;
}

/** A single-button informational notice for a blocked destructive action. */
export async function showDestructiveBlockedNotice(
  input: { detail: string; message: string },
  parentWindow: BrowserWindow | undefined,
): Promise<void> {
  const options: MessageBoxOptions = {
    buttons: [translate("common.close")],
    cancelId: 0,
    defaultId: 0,
    detail: input.detail,
    message: input.message,
    noLink: true,
    type: "warning",
  };
  if (parentWindow) {
    await dialog.showMessageBox(parentWindow, options);
    return;
  }
  await dialog.showMessageBox(options);
}
