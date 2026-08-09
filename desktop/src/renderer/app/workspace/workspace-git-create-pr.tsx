import type { PullRequestCreateResult } from "@angel-engine/daemon-api/github";
import type { ApiClient } from "@/platform/api-client";

import { GitPullRequest } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import { applyPullRequestPrefill } from "@/app/workspace/pull-request-draft";
import {
  createPullRequestAction,
  useCreatePullRequestAction,
} from "@/app/workspace/workspace-create-pr-action";
import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { queryKeys } from "@/platform/query-keys";

interface PullRequestDraft {
  base: string;
  body: string;
  draft: boolean;
  title: string;
}

const pullRequestDrafts = new Map<string, PullRequestDraft>();

export function WorkspaceCreatePullRequestController({
  api,
  root,
}: {
  api: ApiClient;
  root: string;
}) {
  const { openBrowserTab, selectTab } = useWorkspaceToolSurface();
  const [open, setOpen] = useState(false);
  const openDialog = useCallback(() => {
    void selectTab("git");
    setOpen(true);
  }, [selectTab]);
  useCreatePullRequestAction(openDialog);

  return (
    <WorkspaceCreatePullRequestDialog
      api={api}
      open={open}
      root={root}
      onOpenBrowser={openBrowserTab}
      onOpenChange={setOpen}
    />
  );
}

export function WorkspaceCreatePullRequestButton({
  api,
  hasChanges,
  root,
}: {
  api: ApiClient;
  hasChanges: boolean;
  root: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryFn: () => api.github.workspacePullRequestPreflight(root),
    queryKey: queryKeys.github.pullRequestPreflight(root),
    retry: false,
    staleTime: 5_000,
  });
  const preflight = query.data;
  if (
    query.isPending ||
    query.isError ||
    (!preflight?.existing && !preflight?.canCreate)
  ) {
    return null;
  }

  return (
    <div
      className={
        hasChanges
          ? "border-t border-border-subtle px-2 py-1.5"
          : "border-t border-border-subtle p-2"
      }
    >
      <Button
        className={
          hasChanges
            ? "h-auto w-full justify-start px-1 py-0 text-xs"
            : "w-full"
        }
        type="button"
        variant={hasChanges ? "ghost" : "default"}
        onClick={() => createPullRequestAction.execute()}
      >
        <GitPullRequest />
        {preflight.existing
          ? t("workspace.tools.createPullRequest.view", {
              number: preflight.existing.number,
            })
          : t("workspace.tools.createPullRequest.create")}
        {hasChanges && !preflight.existing ? (
          <span className="ml-auto text-muted-foreground">
            {t("workspace.tools.createPullRequest.ahead", {
              base: preflight.base,
              count: preflight.aheadCount,
            })}
          </span>
        ) : null}
      </Button>
    </div>
  );
}

function WorkspaceCreatePullRequestDialog({
  api,
  open,
  root,
  onOpenBrowser,
  onOpenChange,
}: {
  api: ApiClient;
  open: boolean;
  root: string;
  onOpenBrowser: (url: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [base, setBase] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [title, setTitle] = useState("");
  const [failure, setFailure] = useState<
    Extract<PullRequestCreateResult, { status: "failed" }> | undefined
  >();
  const [skipPush, setSkipPush] = useState(false);
  const titleDirty = useRef(false);
  const bodyDirty = useRef(false);
  const initializedKey = useRef<string | null>(null);
  const preflightQuery = useQuery({
    enabled: open,
    queryFn: () =>
      api.github.workspacePullRequestPreflight(root, base || undefined),
    queryKey: queryKeys.github.pullRequestPreflight(root, base || undefined),
    retry: false,
    staleTime: 5_000,
  });
  const preflight = preflightQuery.data;
  const draftKey = preflight ? `${root}\0${preflight.head}` : null;

  useEffect(() => {
    if (!open || !preflight || initializedKey.current === draftKey) return;
    const saved = draftKey ? pullRequestDrafts.get(draftKey) : undefined;
    setBase(saved?.base ?? preflight.base);
    setBody(saved?.body ?? preflight.body);
    setDraft(saved?.draft ?? false);
    setTitle(saved?.title ?? preflight.title);
    titleDirty.current = saved !== undefined;
    bodyDirty.current = saved !== undefined;
    initializedKey.current = draftKey;
    setFailure(undefined);
    setSkipPush(false);
  }, [draftKey, open, preflight]);

  useEffect(() => {
    if (!preflight || initializedKey.current !== draftKey) return;
    const next = applyPullRequestPrefill(
      {
        body,
        bodyDirty: bodyDirty.current,
        title,
        titleDirty: titleDirty.current,
      },
      preflight,
    );
    setTitle(next.title);
    setBody(next.body);
  }, [body, draftKey, preflight, title]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.github.createWorkspacePullRequest({
        base,
        body,
        draft,
        root,
        skipPush,
        title,
      }),
  });
  const close = useCallback(() => {
    if (draftKey) pullRequestDrafts.set(draftKey, { base, body, draft, title });
    onOpenChange(false);
  }, [base, body, draft, draftKey, onOpenChange, title]);
  const submit = useCallback(async () => {
    if (createMutation.isPending || title.trim().length === 0) return;
    const result = await createMutation.mutateAsync();
    if (result.status === "failed") {
      setFailure(result);
      if (result.pushed) setSkipPush(true);
      return;
    }
    if (draftKey) pullRequestDrafts.delete(draftKey);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.github.pullRequestPreflight(root),
    });
    toast({
      action: {
        label: t("workspace.tools.createPullRequest.openInApp"),
        onClick: () => onOpenBrowser(result.record.url),
      },
      title: t(
        result.status === "existing"
          ? "workspace.tools.createPullRequest.existing"
          : "workspace.tools.createPullRequest.created",
        { number: result.record.number },
      ),
      variant: "success",
    });
    onOpenChange(false);
  }, [
    createMutation,
    draftKey,
    onOpenBrowser,
    onOpenChange,
    queryClient,
    root,
    t,
    title,
    toast,
  ]);

  const status = useMemo(() => {
    if (failure?.pushed)
      return t("workspace.tools.createPullRequest.pushedRetry");
    if (createMutation.isPending)
      return skipPush
        ? t("workspace.tools.createPullRequest.creating")
        : t("workspace.tools.createPullRequest.pushing");
    if (!preflight) return "";
    return t("workspace.tools.createPullRequest.willPush", {
      count: preflight.aheadCount,
      head: preflight.head,
    });
  }, [createMutation.isPending, failure, preflight, skipPush, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="gap-4 sm:max-w-2xl">
        <DialogHeader icon={<GitPullRequest />}>
          <DialogTitle>
            {t("workspace.tools.createPullRequest.title")}
          </DialogTitle>
          <DialogDescription>
            {t("workspace.tools.createPullRequest.description")}
          </DialogDescription>
        </DialogHeader>
        {preflightQuery.isPending ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : preflightQuery.isError ? (
          <WorkspaceToolBanner tone="danger">
            {getErrorMessage(preflightQuery.error)}
          </WorkspaceToolBanner>
        ) : preflight ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {preflight.existing ? (
              <WorkspaceToolBanner tone="attention">
                {t("workspace.tools.createPullRequest.existing", {
                  number: preflight.existing.number,
                })}
              </WorkspaceToolBanner>
            ) : null}
            {failure ? (
              <WorkspaceToolBanner tone="danger">
                {failure.error.message}
              </WorkspaceToolBanner>
            ) : null}
            <div className="flex items-center gap-2 text-sm">
              <NativeSelect
                aria-label={t("workspace.tools.createPullRequest.base")}
                className="min-w-40"
                disabled={createMutation.isPending}
                value={base}
                onChange={(event) => {
                  setBase(event.currentTarget.value);
                  setFailure(undefined);
                }}
              >
                {preflight.availableBaseBranches.map((branch) => (
                  <NativeSelectOption key={branch} value={branch}>
                    {branch}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <span aria-hidden="true" className="text-muted-foreground">
                ←
              </span>
              <span className="font-mono text-xs">{preflight.head}</span>
            </div>
            <Input
              autoFocus
              disabled={createMutation.isPending}
              placeholder={t(
                "workspace.tools.createPullRequest.titlePlaceholder",
              )}
              value={title}
              onChange={(event) => {
                titleDirty.current = true;
                setTitle(event.currentTarget.value);
              }}
            />
            <Textarea
              className="min-h-64 font-mono text-xs"
              disabled={createMutation.isPending}
              placeholder={t(
                "workspace.tools.createPullRequest.bodyPlaceholder",
              )}
              value={body}
              onChange={(event) => {
                bodyDirty.current = true;
                setBody(event.currentTarget.value);
              }}
            />
            <DialogFooter className="items-center sm:justify-between">
              <div className="mr-auto flex items-center gap-2">
                <Switch
                  checked={draft}
                  disabled={createMutation.isPending}
                  onCheckedChange={setDraft}
                />
                <span className="text-xs">{t("common.draft")}</span>
              </div>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {status}
              </span>
              <Button
                disabled={createMutation.isPending}
                type="button"
                variant="outline"
                onClick={close}
              >
                {t("common.cancel")}
              </Button>
              <Button
                disabled={
                  createMutation.isPending ||
                  !preflight.canCreate ||
                  title.trim().length === 0 ||
                  preflight.existing !== null
                }
                type="submit"
              >
                {createMutation.isPending ? <Spinner /> : null}
                {failure
                  ? t("workspace.tools.createPullRequest.retry")
                  : t("workspace.tools.createPullRequest.create")}
              </Button>
              {preflight.existing ? (
                <Button
                  type="button"
                  onClick={() => onOpenBrowser(preflight.existing?.url ?? "")}
                >
                  {t("workspace.tools.createPullRequest.openInApp")}
                </Button>
              ) : null}
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
