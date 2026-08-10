import type { FormEvent } from "react";

import { Eye, EyeSlash, LockKey } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { SketchUnderline } from "@/components/sketch-underline";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth/auth-provider";
import { PairingError } from "@/features/auth/session";

export function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const helpId = useId();
  const recoveryId = useId();
  const hasError = error !== null;

  // Focus the field after a failed attempt so the user can correct in place.
  useEffect(() => {
    if (!hasError) return;
    passwordRef.current?.focus();
  }, [hasError, error]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length === 0 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(password);
      // Successful pairing unmounts this page via AuthProvider; leave busy.
    } catch (cause) {
      setError(
        cause instanceof PairingError && cause.reason === "invalid-password"
          ? t("login.incorrectPassword")
          : t("login.connectionError"),
      );
      setIsSubmitting(false);
    }
  };

  const describedBy = hasError
    ? `${helpId} ${errorId} ${recoveryId}`
    : `${helpId} ${recoveryId}`;

  return (
    // Pairing is the one screen with nothing to do but look like the product,
    // so it gets the landing treatment: paper ground, the brand's sketch
    // stroke, pill input and pill CTA.
    <main
      className="
        dot-grid flex min-h-dvh items-center justify-center bg-background p-6
        pt-[max(1.5rem,env(safe-area-inset-top))]
        pb-[max(1.5rem,env(safe-area-inset-bottom))]
      "
    >
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span
            className="
              flex size-12 items-center justify-center rounded-2xl
              bg-primary-soft text-primary-strong
            "
          >
            <LockKey className="size-6" weight="duotone" />
          </span>
          <h1 className="text-3xl font-light tracking-tight">
            <SketchUnderline>Angel Engine</SketchUnderline>
          </h1>
        </div>
        <Card className="rounded-2xl border-border-subtle shadow-panel">
          <CardHeader>
            <CardTitle>{t("login.title")}</CardTitle>
            <CardDescription>{t("login.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              aria-busy={isSubmitting}
              className="flex flex-col gap-4"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pairing-password">
                  {t("login.passwordLabel")}
                </Label>
                <div className="relative">
                  <Input
                    ref={passwordRef}
                    aria-describedby={describedBy}
                    aria-invalid={hasError}
                    autoComplete="current-password"
                    autoFocus
                    // 16px text: anything smaller makes iOS Safari zoom the page
                    // in on focus, and it never zooms back out.
                    className="h-12 rounded-full px-4 pr-14 text-base"
                    disabled={isSubmitting}
                    id="pairing-password"
                    name="password"
                    onChange={(event) => {
                      setPassword(event.currentTarget.value);
                      // Clear the announced error so a later failure is spoken
                      // once again, not as a no-op re-render of the same text.
                      if (error !== null) setError(null);
                    }}
                    placeholder={t("login.passwordPlaceholder")}
                    type={showPassword ? "text" : "password"}
                    value={password}
                  />
                  <Button
                    aria-controls="pairing-password"
                    aria-label={
                      showPassword
                        ? t("login.hidePassword")
                        : t("login.showPassword")
                    }
                    aria-pressed={showPassword}
                    className="
                      absolute top-1/2 right-1 size-11 -translate-y-1/2
                      rounded-full
                    "
                    disabled={isSubmitting}
                    onClick={() => setShowPassword((previous) => !previous)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    {showPassword ? (
                      <EyeSlash className="size-5" weight="regular" />
                    ) : (
                      <Eye className="size-5" weight="regular" />
                    )}
                  </Button>
                </div>
                <p className="px-1 text-xs text-muted-foreground" id={helpId}>
                  {t("login.passwordHelp")}
                </p>
                {hasError ? (
                  <p
                    className="px-1 text-sm text-status-danger"
                    id={errorId}
                    role="alert"
                  >
                    {error}
                  </p>
                ) : null}
                <p
                  className="px-1 text-xs text-muted-foreground"
                  id={recoveryId}
                >
                  {t("login.recoveryHint")}
                </p>
              </div>
              <Button
                className="
                  h-12 w-full rounded-full text-sm font-medium shadow-panel
                  transition-transform duration-150
                  active:scale-[0.98]
                "
                disabled={password.length === 0 || isSubmitting}
                type="submit"
              >
                {isSubmitting ? t("login.connecting") : t("login.connect")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
