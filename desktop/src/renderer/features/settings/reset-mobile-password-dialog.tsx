import type { FC, FormEventHandler } from "react";

import { useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";

interface ResetMobilePasswordDialogProps {
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (password: string) => Promise<void>;
  open: boolean;
}

export const ResetMobilePasswordDialog: FC<ResetMobilePasswordDialogProps> = ({
  isSaving,
  onOpenChange,
  onSave,
  open,
}) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState("");

  const setOpen = (next: boolean) => {
    if (!next) setPassword("");
    onOpenChange(next);
  };
  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    if (password.length === 0 || isSaving) return;
    void onSave(password)
      .then(() => setOpen(false))
      .catch(() => {
        // Keep the dialog open so the user can retry.
      });
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent
        className="gap-5 rounded-2xl"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("settings.mobile.passwordDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("settings.mobile.passwordDialogDescription")}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          <Input
            aria-label={t("settings.mobile.passwordTitle")}
            autoComplete="new-password"
            disabled={isSaving}
            onChange={(event) => setPassword(event.currentTarget.value)}
            ref={inputRef}
            type="password"
            value={password}
          />
          <DialogFooter>
            <Button
              disabled={isSaving}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={password.length === 0 || isSaving} type="submit">
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
