import i18n from "i18next";

import { requestConfirm } from "@/components/ui/confirm-dialog";

export type ConfirmSaveWorkspaceFileChangesResult =
  | "cancel"
  | "discard"
  | "save";

/**
 * The unsaved-changes prompt for the workspace file editor. It lives outside a
 * component because the window-close guard reaches it from a plain async
 * helper, so it reads i18next directly instead of through `useTranslation`.
 */
export async function confirmSaveWorkspaceFileChanges({
  path,
}: {
  path: string;
}): Promise<ConfirmSaveWorkspaceFileChangesResult> {
  return requestConfirm<ConfirmSaveWorkspaceFileChangesResult>({
    actions: [
      { label: i18n.t("common.cancel"), tone: "neutral", value: "cancel" },
      {
        label: i18n.t("dialog.confirm.dontSave"),
        tone: "neutral",
        value: "discard",
      },
      { label: i18n.t("common.save"), value: "save" },
    ],
    cancelValue: "cancel",
    description: i18n.t("dialog.confirm.saveFileChangesDetail"),
    title: i18n.t("dialog.confirm.saveFileChangesTitle", { path }),
  });
}
