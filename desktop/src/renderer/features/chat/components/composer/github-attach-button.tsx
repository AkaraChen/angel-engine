import type { DaemonErrorCode } from "@angel-engine/daemon-api/daemon";
import type { FC, FormEvent } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import { GithubLogo, SpinnerGap } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useEffect, useReducer, useRef } from "react";
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

type PromptGitHubAttachButtonProps = {
  disabled?: boolean;
  onAttached: (attachment: ComposerGitHubAttachment) => void;
};

type GitHubAttachDialogState = {
  error: string | null;
  open: boolean;
  pending: boolean;
  url: string;
};

type GitHubAttachDialogAction =
  | { type: "close" }
  | { type: "open" }
  | { error: string; type: "requestFailed" }
  | { type: "requestStarted" }
  | { type: "urlChanged"; url: string };

const initialDialogState: GitHubAttachDialogState = {
  error: null,
  open: false,
  pending: false,
  url: "",
};

export const PromptGitHubAttachButton: FC<PromptGitHubAttachButtonProps> = ({
  disabled = false,
  onAttached,
}) => {
  const { t } = useTranslation();
  const api = useApi();
  const [dialog, dispatch] = useReducer(
    gitHubAttachDialogReducer,
    initialDialogState,
  );
  const activeRequestId = useRef(0);

  useEffect(
    () => () => {
      activeRequestId.current += 1;
    },
    [],
  );

  const handleOpenChange = (next: boolean) => {
    if (next) {
      dispatch({ type: "open" });
      return;
    }

    activeRequestId.current += 1;
    dispatch({ type: "close" });
  };

  const resolveUrl = async () => {
    const trimmed = dialog.url.trim();
    if (!is.nonEmptyString(trimmed) || dialog.pending) return;

    const requestId = activeRequestId.current + 1;
    activeRequestId.current = requestId;
    dispatch({ type: "requestStarted" });
    try {
      const resolved = await api.github.resolveUrl({ url: trimmed });
      if (activeRequestId.current !== requestId) return;

      onAttached({
        ...resolved,
        id: `github-${resolved.kind}-${resolved.owner}-${resolved.repo}-${resolved.number}-${crypto.randomUUID()}`,
      });
      handleOpenChange(false);
    } catch (cause) {
      if (activeRequestId.current !== requestId) return;

      dispatch({
        error: githubResolveErrorMessage(cause, t),
        type: "requestFailed",
      });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void resolveUrl();
  };

  return (
    <Dialog open={dialog.open} onOpenChange={handleOpenChange}>
      <Button
        className="focus-visible:ring-0!"
        disabled={disabled}
        onClick={() => handleOpenChange(true)}
        size="icon-sm"
        title={t("composer.attachGitHub")}
        type="button"
        variant="ghost"
      >
        <GithubLogo weight="duotone" />
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
            disabled={dialog.pending}
            onChange={(event) =>
              dispatch({
                type: "urlChanged",
                url: event.currentTarget.value,
              })
            }
            placeholder={t("composer.attachGitHubPlaceholder")}
            value={dialog.url}
          />
          {is.nonEmptyString(dialog.error) ? (
            <p className="text-sm text-destructive">{dialog.error}</p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => handleOpenChange(false)}
              type="button"
              variant="outline"
            >
              {t("common.cancel")}
            </Button>
            <Button
              disabled={dialog.pending || !is.nonEmptyString(dialog.url.trim())}
              type="submit"
            >
              {dialog.pending ? (
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
};

function gitHubAttachDialogReducer(
  state: GitHubAttachDialogState,
  action: GitHubAttachDialogAction,
): GitHubAttachDialogState {
  switch (action.type) {
    case "close":
      return initialDialogState;
    case "open":
      return { ...state, open: true };
    case "requestFailed":
      return { ...state, error: action.error, pending: false };
    case "requestStarted":
      return { ...state, error: null, pending: true };
    case "urlChanged":
      return { ...state, url: action.url };
  }
}

const GITHUB_ERROR_TRANSLATION_KEYS = {
  "github-cli-missing": "composer.githubErrors.cliMissing",
  "github-cli-unauthenticated": "composer.githubErrors.cliUnauthenticated",
  "github-fetch-failed": "composer.githubErrors.fetchFailed",
  "github-item-not-found": "composer.githubErrors.notFound",
  "github-url-unsupported": "composer.githubErrors.urlUnsupported",
} as const satisfies Partial<Record<DaemonErrorCode, string>>;

type GitHubErrorCode = keyof typeof GITHUB_ERROR_TRANSLATION_KEYS;

function githubResolveErrorMessage(
  cause: unknown,
  t: (key: string, options?: Record<string, string>) => string,
): string {
  if (cause instanceof DaemonRequestError && isGitHubErrorCode(cause.code)) {
    return t(GITHUB_ERROR_TRANSLATION_KEYS[cause.code]);
  }
  if (cause instanceof Error && is.nonEmptyString(cause.message)) {
    return cause.message;
  }
  return t("composer.githubErrors.fetchFailed");
}

function isGitHubErrorCode(
  code: DaemonErrorCode | undefined,
): code is GitHubErrorCode {
  return (
    code !== undefined && Object.hasOwn(GITHUB_ERROR_TRANSLATION_KEYS, code)
  );
}
