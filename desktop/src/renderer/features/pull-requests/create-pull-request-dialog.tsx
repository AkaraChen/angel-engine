import type { ReactElement } from "react";
import { DaemonRequestError } from "@angel-engine/daemon-client";
import { SpinnerGap } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  createPullRequestMutationOptions,
  pullRequestTemplateQueryOptions,
} from "@/features/pull-requests/api/queries";
import { useApi } from "@/platform/use-api";

interface CreatePullRequestDialogProps {
  cwd: string;
  onCreated: (number: number) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CreatePullRequestDialog({
  cwd,
  onCreated,
  onOpenChange,
  open,
}: CreatePullRequestDialogProps): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("");
  const [draft, setDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templateApplied, setTemplateApplied] = useState(false);

  const templateQuery = useQuery(
    pullRequestTemplateQueryOptions({
      api,
      cwd,
      enabled: open,
    }),
  );

  useEffect(() => {
    if (!open) {
      setTitle("");
      setBody("");
      setBase("");
      setDraft(false);
      setError(null);
      setTemplateApplied(false);
      return;
    }
    if (!templateApplied && templateQuery.data) {
      setBody(templateQuery.data.body);
      setTemplateApplied(true);
    }
  }, [open, templateApplied, templateQuery.data]);

  const createMutation = useMutation({
    ...createPullRequestMutationOptions({ api }),
    onError: (cause) => {
      setError(
        cause instanceof DaemonRequestError
          ? cause.message
          : cause instanceof Error
            ? cause.message
            : String(cause),
      );
    },
    onSuccess: (result) => {
      setError(null);
      onCreated(result.number);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pullRequests.createTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="pr-title">
              {t("pullRequests.fieldTitle")}
            </label>
            <Input
              id="pr-title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="pr-base">
              {t("pullRequests.fieldBase")}
            </label>
            <Input
              id="pr-base"
              onChange={(event) => setBase(event.target.value)}
              placeholder={t("pullRequests.fieldBasePlaceholder")}
              value={base}
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-medium" htmlFor="pr-body">
                {t("pullRequests.fieldBody")}
              </label>
              {templateQuery.data && templateQuery.data.templates.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t("pullRequests.templateApplied", {
                    name:
                      templateQuery.data.templates[0]?.relativePath ??
                      templateQuery.data.templates[0]?.name ??
                      "template",
                  })}
                </span>
              ) : null}
            </div>
            <Textarea
              id="pr-body"
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              value={body}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={draft}
              onChange={(event) => setDraft(event.target.checked)}
              type="checkbox"
            />
            {t("pullRequests.createAsDraft")}
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={
              createMutation.isPending || !is.nonEmptyString(title.trim())
            }
            onClick={() =>
              createMutation.mutate({
                base: is.nonEmptyString(base.trim()) ? base.trim() : undefined,
                body,
                cwd,
                draft,
                title: title.trim(),
              })
            }
          >
            {createMutation.isPending ? (
              <SpinnerGap className="size-4 animate-spin" />
            ) : null}
            {t("pullRequests.createSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
