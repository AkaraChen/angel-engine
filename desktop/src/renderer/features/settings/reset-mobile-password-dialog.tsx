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
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const showRequiredError = password.length === 0 && submitAttempted;

  const setOpen = (next: boolean) => {
    if (!next) {
      setPassword("");
      setSubmitAttempted(false);
      setSaveError(null);
    }
    onOpenChange(next);
  };
  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setSaveError(null);
    if (password.length === 0) {
      // Name the missing field instead of silently ignoring the attempt.
      setSubmitAttempted(true);
      inputRef.current?.focus();
      return;
    }
    if (isSaving) return;
    void onSave(password)
      .then(() => setOpen(false))
      .catch((error: unknown) => {
        // Keep the dialog open with the precise reason so the user can
        // correct and retry; the entered password is preserved.
        setSaveError(
          error instanceof Error && error.message.length > 0
            ? error.message
            : t("settings.mobile.saveFailed"),
        );
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
          <div className="grid gap-1.5">
            <Input
              aria-describedby={
                showRequiredError ? "mobile-password-error" : undefined
              }
              aria-invalid={showRequiredError}
              aria-label={t("settings.mobile.passwordTitle")}
              autoComplete="new-password"
              disabled={isSaving}
              onChange={(event) => setPassword(event.currentTarget.value)}
              ref={inputRef}
              type="password"
              value={password}
            />
            {showRequiredError ? (
              <p
                className="text-xs text-destructive"
                id="mobile-password-error"
                role="alert"
              >
                {t("settings.mobile.passwordRequired")}
              </p>
            ) : null}
            {saveError === null ? null : (
              <p className="text-xs text-destructive" role="alert">
                {saveError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              disabled={isSaving}
              onClick={() => setOpen(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button disabled={isSaving} type="submit">
              {isSaving ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
