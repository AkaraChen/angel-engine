import type { FormEvent } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import { GithubLogo, SpinnerGap } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useState } from "react";
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
import type { ComposerGitHubAttachment } from "@/features/chat/components/composer/github-attachments";
import { useApi } from "@/platform/use-api";

interface PromptGitHubAttachButtonProps {
  disabled?: boolean;
  onAttached: (attachment: ComposerGitHubAttachment) => void;
}

export function PromptGitHubAttachButton({
  disabled = false,
  onAttached,
}: PromptGitHubAttachButtonProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reset = () => {
    setUrl("");
    setError(null);
    setPending(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!is.nonEmptyString(trimmed) || pending) return;

    setPending(true);
    setError(null);
    try {
      const resolved = await api.github.resolveUrl({ url: trimmed });
      onAttached({
        ...resolved,
        id: `github-${resolved.kind}-${resolved.owner}-${resolved.repo}-${resolved.number}-${crypto.randomUUID()}`,
      });
      handleOpenChange(false);
    } catch (cause) {
      setError(githubResolveErrorMessage(cause, t));
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button
        className="focus-visible:ring-0!"
        disabled={disabled}
        onClick={() => setOpen(true)}
        size="icon-sm"
        title={t("composer.attachGitHub")}
        type="button"
        variant="ghost"
      >
        <GithubLogo />
        <span className="sr-only">{t("composer.attachGitHub")}</span>
      </Button>
      <DialogContent className="gap-4 rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("composer.attachGitHubTitle")}</DialogTitle>
          <DialogDescription>
            {t("composer.attachGitHubDescription")}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
          <Input
            autoFocus
            disabled={pending}
            onChange={(event) => setUrl(event.currentTarget.value)}
            placeholder={t("composer.attachGitHubPlaceholder")}
            value={url}
          />
          {is.nonEmptyString(error) ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={pending}
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={pending || !is.nonEmptyString(url.trim())}
              type="submit"
            >
              {pending ? (
                <>
                  <SpinnerGap className="animate-spin" />
                  {t("composer.attachGitHubLoading")}
                </>
              ) : (
                t("composer.attachGitHubConfirm")
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function githubResolveErrorMessage(
  cause: unknown,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (cause instanceof DaemonRequestError && is.nonEmptyString(cause.code)) {
    switch (cause.code) {
      case "github-cli-missing":
        return t("composer.githubErrors.cliMissing");
      case "github-cli-unauthenticated":
        return t("composer.githubErrors.cliUnauthenticated");
      case "github-url-unsupported":
        return t("composer.githubErrors.urlUnsupported");
      case "github-item-not-found":
        return t("composer.githubErrors.notFound");
      case "github-fetch-failed":
        return t("composer.githubErrors.fetchFailed");
      default:
        break;
    }
  }
  if (cause instanceof Error && is.nonEmptyString(cause.message)) {
    return cause.message;
  }
  return t("composer.githubErrors.fetchFailed");
}
