import type { DesktopUpdateMessageEvent } from "@shared/desktop-window";

import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { requestConfirm } from "@/components/ui/confirm-dialog";

/**
 * Update notices used to be native message boxes raised from the main process.
 * They now arrive as events and render in the same in-app dialog as every other
 * prompt, so an update notice can no longer block the window it belongs to.
 */
export function UpdateMessageDialog() {
  const { t } = useTranslation();

  useEffect(() => {
    return window.desktopWindow.onUpdateMessage((event) => {
      void showUpdateMessage(event, t);
    });
  }, [t]);

  return null;
}

async function showUpdateMessage(
  event: DesktopUpdateMessageEvent,
  t: (key: string) => string,
) {
  const wantsInstall = event.actions.includes("install");
  const choice = await requestConfirm({
    actions: wantsInstall
      ? [
          { label: t("common.cancel"), tone: "neutral", value: "cancel" },
          { label: t("updates.restartAndInstall"), value: "install" },
        ]
      : [{ label: t("common.close"), tone: "neutral", value: "cancel" }],
    cancelValue: "cancel",
    description: event.detail,
    title: event.message,
  });

  if (choice === "install") {
    void window.desktopWindow.installUpdate();
  }
}
