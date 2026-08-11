import { MagicWand, Warning } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export function WorktreeSetupGuidance({
  hasLegacyInitScript,
  onConfigure,
  onDismiss,
  onMigrate,
}: {
  hasLegacyInitScript: boolean;
  onConfigure: () => void;
  onDismiss: () => void;
  onMigrate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 rounded-xl border border-status-warning-border bg-status-warning-soft p-3 text-sm">
      <div className="flex items-start gap-2">
        <Warning className="mt-0.5 size-4 shrink-0 text-status-warning" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {t("workspace.worktreeSetupMissingTitle")}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(
              hasLegacyInitScript
                ? "workspace.worktreeSetupLegacyDescription"
                : "workspace.worktreeSetupMissingDescription",
            )}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {hasLegacyInitScript ? (
              <Button onClick={onMigrate} size="sm" type="button">
                {t("workspace.worktreeSetupMigrate")}
              </Button>
            ) : null}
            <Button onClick={onConfigure} size="sm" type="button">
              <MagicWand />
              {t("workspace.worktreeSetupConfigure")}
            </Button>
            <Button onClick={onDismiss} size="sm" type="button" variant="ghost">
              {t("workspace.worktreeSetupDismiss")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
