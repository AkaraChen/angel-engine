import type { ApiClient } from "@/platform/api-client";
import type { ExistingPullRequestTarget } from "@/app/workspace/workspace-create-pr-action";

import {
  Check,
  Copy,
  FileText,
  GitCommit,
  GitPullRequest,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Streamdown } from "streamdown";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import { openExistingPullRequest } from "@/app/workspace/workspace-create-pr-action";
import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { pullRequestDetailQueryOptions } from "@/features/pull-requests/api/queries";

export function WorkspacePullRequestPreviewDialog({
  api,
  open,
  root,
  target,
  onOpenExternal,
  onOpenChange,
}: {
  api: ApiClient;
  open: boolean;
  root: string;
  target: ExistingPullRequestTarget | null;
  onOpenExternal: (url: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const detailQuery = useQuery(
    pullRequestDetailQueryOptions({
      api,
      cwd: root,
      enabled: open && target !== null,
      number: target?.number ?? null,
      staleTime: 15_000,
    }),
  );

  useEffect(() => setCopied(false), [open, target]);

  const detail = detailQuery.data;
  const close = () => onOpenChange(false);
  const copyLink = async () => {
    if (!target) return;
    await navigator.clipboard.writeText(target.url);
    setCopied(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(46rem,calc(100vh-2rem))] gap-4 overflow-hidden sm:max-w-2xl">
        <DialogHeader icon={<GitPullRequest />}>
          <DialogTitle>
            {t("workspace.tools.createPullRequest.preview.title", {
              number: target?.number ?? "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("workspace.tools.createPullRequest.preview.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          {detailQuery.isPending ? (
            <div className="flex min-h-64 items-center justify-center">
              <Spinner />
            </div>
          ) : detailQuery.isError ? (
            <WorkspaceToolBanner tone="danger">
              <div className="font-medium">
                {t("workspace.tools.createPullRequest.preview.loadFailed")}
              </div>
              <div>{getErrorMessage(detailQuery.error)}</div>
              <Button
                className="mt-2"
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void detailQuery.refetch()}
              >
                {t("workspace.tools.createPullRequest.retry")}
              </Button>
            </WorkspaceToolBanner>
          ) : detail ? (
            <div className="grid gap-4">
              <div className="grid gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
                    {detail.isDraft
                      ? t("common.draft")
                      : detail.state.toLocaleLowerCase() === "open"
                        ? t("workspace.tools.createPullRequest.preview.open")
                        : detail.state.toLocaleLowerCase()}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    {detail.baseRefName} ← {detail.headRefName}
                  </span>
                </div>
                <h2 className="text-lg font-semibold leading-snug">
                  {detail.title}
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PreviewStat
                  icon={<GitCommit />}
                  label={t("workspace.tools.createPullRequest.preview.commits")}
                  value={detail.commitCount}
                />
                <PreviewStat
                  icon={<FileText />}
                  label={t(
                    "workspace.tools.createPullRequest.preview.filesChanged",
                  )}
                  value={detail.changedFiles}
                />
                <PreviewStat
                  label={t(
                    "workspace.tools.createPullRequest.preview.additions",
                  )}
                  value={`+${detail.additions}`}
                  valueClassName="text-emerald-500"
                />
                <PreviewStat
                  label={t(
                    "workspace.tools.createPullRequest.preview.deletions",
                  )}
                  value={`−${detail.deletions}`}
                  valueClassName="text-destructive"
                />
              </div>

              <section className="grid gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("workspace.tools.createPullRequest.preview.body")}
                </h3>
                {is.nonEmptyString(detail.body) ? (
                  <Streamdown
                    className="rounded-lg border border-border-subtle bg-muted/20 p-4 text-sm"
                    controls={false}
                    linkSafety={{ enabled: false }}
                    lineNumbers={false}
                    mode="static"
                  >
                    {detail.body}
                  </Streamdown>
                ) : (
                  <p className="rounded-lg border border-dashed border-border-subtle p-4 text-sm text-muted-foreground">
                    {t("workspace.tools.createPullRequest.preview.emptyBody")}
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            disabled={!target}
            type="button"
            variant="outline"
            onClick={() => void copyLink()}
          >
            {copied ? <Check /> : <Copy />}
            {t(
              copied
                ? "workspace.tools.createPullRequest.preview.copied"
                : "workspace.tools.createPullRequest.preview.copyLink",
            )}
          </Button>
          <Button
            disabled={!target}
            type="button"
            onClick={() => {
              if (!target) return;
              openExistingPullRequest({
                close,
                openExternal: onOpenExternal,
                url: target.url,
              });
            }}
          >
            {t("workspace.tools.createPullRequest.openInBrowser")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewStat({
  icon,
  label,
  value,
  valueClassName,
}: {
  icon?: ReactNode;
  label: string;
  value: number | string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-muted/20 p-2.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        {label}
      </div>
      <div className={valueClassName ?? ""}>{value}</div>
    </div>
  );
}
