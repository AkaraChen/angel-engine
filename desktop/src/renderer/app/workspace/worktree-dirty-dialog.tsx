import type { FC } from "react";
import type { WorktreeDirtyPromptState } from "@/app/workspace/use-worktree-draft-guard";

import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WorktreeDirtyDialogProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  onClose: (confirmed: boolean) => void;
  state: WorktreeDirtyPromptState | null;
}

export const WorktreeDirtyDialog: FC<WorktreeDirtyDialogProps> = ({
  checked,
  onCheckedChange,
  onClose,
  state,
}) => {
  const { t } = useTranslation();
  const projectPath = state?.status.path;

  return (
    <Dialog
      open={!is.falsy(state)}
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t("workspace.worktreeDirtyTitle")}</DialogTitle>
          <DialogDescription>
            {t("workspace.worktreeDirtyDescription")}
          </DialogDescription>
        </DialogHeader>
        {is.nonEmptyString(projectPath) ? (
          <div
            className="
              min-w-0 rounded-md border bg-muted/35 px-3 py-2 text-xs
              text-muted-foreground
            "
            title={projectPath}
          >
            <span className="block truncate">{projectPath}</span>
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            checked={checked}
            className="size-4 accent-primary"
            onChange={(event) => onCheckedChange(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>{t("workspace.worktreeDirtyRemember")}</span>
        </label>
        <DialogFooter>
          <Button
            onClick={() => onClose(false)}
            type="button"
            variant="outline"
          >
            {t("common.cancel")}
          </Button>
          <Button onClick={() => onClose(true)} type="button">
            {t("workspace.worktreeDirtyContinue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
