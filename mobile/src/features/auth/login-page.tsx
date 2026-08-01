import type { FormEvent } from "react";

import { LockKey } from "@phosphor-icons/react";
import { useState } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (password.length === 0 || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await signIn(password);
    } catch (cause) {
      setError(
        cause instanceof PairingError && cause.reason === "invalid-password"
          ? t("login.incorrectPassword")
          : t("login.connectionError"),
      );
      setIsSubmitting(false);
    }
  };

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
              bg-primary-soft text-primary
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
              className="flex flex-col gap-4"
              onSubmit={(event) => void handleSubmit(event)}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pairing-password">
                  {t("login.passwordLabel")}
                </Label>
                <Input
                  autoComplete="current-password"
                  autoFocus
                  // 16px text: anything smaller makes iOS Safari zoom the page
                  // in on focus, and it never zooms back out.
                  className="h-12 rounded-full px-4 text-base"
                  id="pairing-password"
                  onChange={(event) => setPassword(event.currentTarget.value)}
                  placeholder={t("login.passwordPlaceholder")}
                  type="password"
                  value={password}
                />
              </div>
              {error !== null ? (
                <p className="text-sm text-status-danger">{error}</p>
              ) : null}
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
