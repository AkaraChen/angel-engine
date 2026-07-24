import type { DaemonRuntimeConfig } from "@/platform/chat-types";

import { Hammer, ListChecks } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";

import { findPlanModeToggleTarget } from "./mode-options";

export interface ComposerPlanModeProps {
  config: DaemonRuntimeConfig | null;
  disabled?: boolean;
  onSetMode: (mode: string) => Promise<void>;
  onSetPermissionMode: (mode: string) => Promise<void>;
}

/**
 * Plan/build toggle for the mobile composer. Renders nothing when the runtime
 * cannot switch modes (capability-gated — never hard-coded).
 */
export function ComposerPlanMode({
  config,
  disabled,
  onSetMode,
  onSetPermissionMode,
}: ComposerPlanModeProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const target = findPlanModeToggleTarget([
    {
      canSet: config?.canSetMode === true,
      family: "agent",
      options: config?.modes ?? [],
      value: config?.currentMode ?? "",
    },
    {
      canSet: config?.canSetPermissionMode === true,
      family: "permission",
      options: config?.permissionModes ?? [],
      value: config?.currentPermissionMode ?? "",
    },
  ]);

  if (!target) return null;

  const unavailable = disabled || pending || !target.targetMode;
  const label = target.isPlanMode ? t("chat.plan") : t("chat.build");
  const title = target.isPlanMode
    ? t("chat.switchToBuild")
    : t("chat.switchToPlan");
  const Icon = target.isPlanMode ? ListChecks : Hammer;

  return (
    <Button
      aria-label={title}
      aria-pressed={target.isPlanMode}
      className="h-8 gap-1.5 rounded-md px-2 text-xs"
      disabled={unavailable}
      onClick={() => {
        if (!target.targetMode) return;
        setPending(true);
        const setMode =
          target.family === "agent" ? onSetMode : onSetPermissionMode;
        void Promise.resolve(setMode(target.targetMode.value)).finally(() =>
          setPending(false),
        );
      }}
      title={title}
      type="button"
      variant={target.isPlanMode ? "secondary" : "ghost"}
    >
      <Icon className="size-3.5" weight="duotone" />
      <span>{label}</span>
    </Button>
  );
}
