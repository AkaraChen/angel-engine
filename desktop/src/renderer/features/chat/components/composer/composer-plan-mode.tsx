import type { ChatOptionsContextValue } from "@/features/chat/runtime/chat-options-context";
import { Hammer, ListChecks } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { findPlanModeToggleTarget } from "@/features/chat/runtime/mode-options";

export interface PlanModeToggleButtonProps {
  disabled?: boolean;
  options: ChatOptionsContextValue;
}

export function PlanModeToggleButton({
  disabled,
  options,
}: PlanModeToggleButtonProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const target = findPlanModeToggleTarget([
    {
      canSet: options.canSetMode,
      family: "agent",
      options: options.modeOptions,
      value: options.mode,
    },
    {
      canSet: options.canSetPermissionMode,
      family: "permission",
      options: options.permissionModeOptions,
      value: options.permissionMode,
    },
  ]);
  const unavailable =
    disabled || pending || options.configLoading || !target?.targetMode;
  const label = target?.isPlanMode ? t("composer.plan") : t("common.build");
  const title = target?.isPlanMode
    ? t("composer.switchToBuild", {
        defaultValue: "Switch to build mode",
      })
    : t("composer.switchToPlan", {
        defaultValue: "Switch to plan mode",
      });
  const Icon = target?.isPlanMode ? ListChecks : Hammer;

  return (
    <Button
      aria-pressed={Boolean(target?.isPlanMode)}
      className="
        h-8 gap-1.5 rounded-md px-2 text-xs
        focus-visible:ring-0!
      "
      disabled={unavailable}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (!target?.targetMode) return;
        setPending(true);
        const setMode =
          target.family === "agent"
            ? options.setMode
            : options.setPermissionMode;
        void Promise.resolve(setMode(target.targetMode.value))
          .catch((error: unknown) => {
            toast({
              description: getErrorMessage(error),
              title: t("composer.toasts.couldNotChangeMode"),
              variant: "destructive",
            });
          })
          .finally(() => setPending(false));
      }}
      title={title}
      type="button"
      variant="ghost"
    >
      <Icon className="size-3.5" weight="duotone" />
      <span>{label}</span>
    </Button>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
