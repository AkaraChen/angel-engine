import type { FormEvent } from "react";

import { LockKey } from "@phosphor-icons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

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
    <main className="flex min-h-dvh items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div
            className="
              mb-1 flex size-10 items-center justify-center rounded-full
              bg-primary/10 text-primary
            "
          >
            <LockKey className="size-5" weight="duotone" />
          </div>
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
                id="pairing-password"
                onChange={(event) => setPassword(event.currentTarget.value)}
                placeholder={t("login.passwordPlaceholder")}
                type="password"
                value={password}
              />
            </div>
            {error !== null ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            <Button
              className="w-full"
              disabled={password.length === 0 || isSubmitting}
              type="submit"
            >
              {isSubmitting ? t("login.connecting") : t("login.connect")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
