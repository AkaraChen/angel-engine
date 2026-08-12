import type {
  CapabilityMatrix,
  ChangeRequest,
  ChangeRequestCreatePreflightResult,
} from "@angel-engine/daemon-api/source-control";
import type { ApiClient } from "@/platform/api-client";

import { GitPullRequest } from "@phosphor-icons/react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  applyPullRequestPrefill,
  resetPullRequestDialogState,
} from "@/app/workspace/pull-request-draft";
import {
  createPullRequestAction,
  executeCreatePullRequestAction,
  type ExistingPullRequestTarget,
  openExistingPullRequest,
  openPullRequestInSystemBrowser,
  useCreatePullRequestAction,
} from "@/app/workspace/workspace-create-pr-action";
import { WorkspacePullRequestPreviewDialog } from "@/app/workspace/workspace-pull-request-preview";
import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { chatMetadataQueryOptions } from "@/features/chat/api/queries";
import { Button } from "@/components/ui/button";
import { useSourceControlActivation } from "@/features/source-control/api/use-activation";
import { CapabilityGate } from "@/features/source-control/components/capability-gate";
import { capabilityState } from "@/features/source-control/model";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { queryKeys } from "@/platform/query-keys";
import { cn } from "@/platform/utils";

interface PullRequestDraft {
  base: string;
  body: string;
  draft: boolean;
  title: string;
}

interface WorkspaceChangeRequestPreflight
  extends ChangeRequestCreatePreflightResult {
  availableBaseBranches: readonly string[];
  base: string;
  body: string;
  canCreate: boolean;
  head: string;
  reason?: "pull-request-no-commits";
  title: string;
}

const pullRequestDrafts = new Map<string, PullRequestDraft>();

export function WorkspaceCreatePullRequestController({
  api,
  contextKey,
  projectId,
  root,
}: {
  api: ApiClient;
  contextKey: string | null;
  projectId: string | null;
  root: string;
}) {
  const { selectTab } = useWorkspaceToolSurface();
  const [open, setOpen] = useState(false);
  const [previewTarget, setPreviewTarget] =
    useState<ExistingPullRequestTarget | null>(null);
  const preflightQuery = useWorkspaceGitPullRequestPreflight(api, projectId);
  const preflight = preflightQuery.data;
  const refetchPreflight = preflightQuery.refetch;
  const openDialog = useCallback(() => {
    void selectTab("git");
    setOpen(true);
  }, [selectTab]);
  const executeAction = useCallback(() => {
    void (async () => {
      const resolvedPreflight = preflight ?? (await refetchPreflight()).data;
      executeCreatePullRequestAction({
        existing: toExistingTarget(resolvedPreflight?.existing ?? null),
        openDialog,
        openPreview: (target) => {
          setOpen(false);
          void selectTab("git");
          setPreviewTarget(target);
        },
      });
    })();
  }, [openDialog, preflight, refetchPreflight, selectTab]);
  useCreatePullRequestAction(executeAction);

  useEffect(() => {
    setOpen(resetPullRequestDialogState(root).open);
    setPreviewTarget(null);
  }, [root]);

  return (
    <>
      <WorkspaceCreatePullRequestDialog
        api={api}
        contextKey={contextKey}
        open={open}
        projectId={projectId}
        root={root}
        onOpenExternal={openPullRequestInSystemBrowser}
        onOpenChange={setOpen}
      />
      <WorkspacePullRequestPreviewDialog
        api={api}
        open={previewTarget !== null}
        projectId={projectId}
        target={previewTarget}
        onOpenExternal={openPullRequestInSystemBrowser}
        onOpenChange={(next) => {
          if (!next) setPreviewTarget(null);
        }}
      />
    </>
  );
}

export function useWorkspaceGitPullRequestPreflight(
  api: ApiClient,
  projectId: string | null,
  targetBranch?: string,
  enabled = true,
) {
  const sourceControl = useSourceControlActivation(projectId);
  const supportsPreflight = capabilityState(
    sourceControl.capabilities,
    "changeRequests.preflight",
  ).supported;
  const supportsList = capabilityState(
    sourceControl.capabilities,
    "changeRequests.list",
  ).supported;
  const supportsTemplate = capabilityState(
    sourceControl.capabilities,
    "repositoryIdentity",
  ).supported;
  const ready =
    enabled &&
    sourceControl.status === "active" &&
    sourceControl.projectPath !== null &&
    sourceControl.providerIdentity !== null;
  const preflightQuery = useQuery({
    enabled: ready && supportsPreflight && supportsList,
    queryFn: () =>
      api.sourceControl.changeRequestPreflight(
        sourceControl.projectPath ?? "",
        targetBranch,
      ),
    queryKey: queryKeys.sourceControl.changeRequestPreflight(
      sourceControl.providerIdentity,
      null,
      targetBranch ?? null,
    ),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 5_000,
  });
  const templateQuery = useQuery({
    enabled: ready && supportsTemplate,
    queryFn: () =>
      api.sourceControl.changeRequestTemplate(sourceControl.projectPath ?? ""),
    queryKey: queryKeys.sourceControl.changeRequestTemplate(
      sourceControl.providerIdentity,
    ),
    staleTime: 30_000,
  });
  const data = useMemo<WorkspaceChangeRequestPreflight | undefined>(() => {
    const preflight = preflightQuery.data;
    if (!preflight) return undefined;
    return {
      ...preflight,
      availableBaseBranches: preflight.availableTargetBranches,
      base: preflight.targetBranch,
      body: templateQuery.data?.body ?? "",
      canCreate: preflight.aheadCount > 0 || preflight.existing !== null,
      head: preflight.sourceBranch,
      reason:
        preflight.aheadCount === 0 && preflight.existing === null
          ? "pull-request-no-commits"
          : undefined,
      title: titleFromBranch(preflight.sourceBranch),
    };
  }, [preflightQuery.data, templateQuery.data?.body]);
  return {
    ...preflightQuery,
    capabilities: sourceControl.capabilities,
    data,
    projectPath: sourceControl.projectPath,
    providerActive: sourceControl.status === "active",
    refetch: async () => {
      if (!ready || !supportsPreflight || !supportsList) {
        return { data: undefined };
      }
      const [preflight] = await Promise.all([
        preflightQuery.refetch(),
        supportsTemplate ? templateQuery.refetch() : Promise.resolve(),
      ]);
      return preflight;
    },
    refetchActivation: () => sourceControl.refetch(),
  };
}

export function WorkspaceGitPullRequestAction({
  capabilities,
  preflight,
  providerActive,
  onRemediate,
}: {
  capabilities: CapabilityMatrix;
  preflight?: WorkspaceChangeRequestPreflight;
  providerActive: boolean;
  onRemediate: () => void;
}) {
  const { t } = useTranslation();
  const createCapability = capabilityState(
    capabilities,
    "changeRequests.create",
  );
  if (
    !providerActive ||
    (!preflight?.existing &&
      !preflight?.canCreate &&
      createCapability.supported)
  ) {
    return null;
  }

  const existing = preflight?.existing ?? null;
  const label = existing
    ? t("workspace.tools.createPullRequest.viewShort", {
        number: existing.number ?? Number(existing.id),
      })
    : t("workspace.tools.createPullRequest.short");
  const tooltip = existing
    ? `${t("workspace.tools.createPullRequest.view", {
        number: existing.number ?? Number(existing.id),
      })} · ${existing.draft ? t("common.draft").toLocaleLowerCase() : existing.state}`
    : t("workspace.tools.createPullRequest.create");

  const button = (
    <Button
      aria-label={label}
      className={cn(
        "w-6 px-0 @[250px]:w-auto @[250px]:px-2",
        existing?.draft && "text-muted-foreground",
      )}
      size="xs"
      title={tooltip}
      type="button"
      variant={existing ? "ghost" : "outline"}
      onClick={() => createPullRequestAction.execute()}
    >
      <GitPullRequest />
      <span className="hidden @[250px]:inline">{label}</span>
    </Button>
  );
  if (!existing && !createCapability.supported) {
    return (
      <CapabilityGate
        capabilities={capabilities}
        capability="changeRequests.create"
        remediationLabel={t("common.retry")}
        onRemediate={onRemediate}
      >
        {button}
      </CapabilityGate>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function WorkspaceCreatePullRequestDialog({
  api,
  contextKey,
  open,
  projectId,
  root,
  onOpenExternal,
  onOpenChange,
}: {
  api: ApiClient;
  contextKey: string | null;
  open: boolean;
  projectId: string | null;
  root: string;
  onOpenExternal: (url: string) => void;
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
    { error: Error; pushed: boolean } | undefined
  >();
  const [skipPush, setSkipPush] = useState(false);
  const titleDirty = useRef(false);
  const bodyDirty = useRef(false);
  const initializedKey = useRef<string | null>(null);
  const chatId = contextKey?.startsWith("chat:")
    ? contextKey.slice("chat:".length)
    : null;
  const chatQuery = useQuery({
    ...chatMetadataQueryOptions({
      api,
      chatId: chatId ?? "",
      enabled: open && chatId !== null,
    }),
  });
  const preflightQuery = useWorkspaceGitPullRequestPreflight(
    api,
    projectId,
    base || undefined,
    open,
  );
  const preflight = preflightQuery.data;
  const draftKey = preflight ? `${root}\0${preflight.head}` : null;
  const preferredTitle =
    chatQuery.data?.title?.trim() || preflight?.title || "";

  useEffect(() => {
    const reset = resetPullRequestDialogState(root);
    setBase(reset.base);
    setBody(reset.body);
    setDraft(reset.draft);
    setTitle(reset.title);
    setFailure(undefined);
    setSkipPush(false);
    titleDirty.current = false;
    bodyDirty.current = false;
    initializedKey.current = null;
  }, [root]);

  useEffect(() => {
    if (!open || !preflight || initializedKey.current === draftKey) return;
    const saved = draftKey ? pullRequestDrafts.get(draftKey) : undefined;
    setBase(saved?.base ?? preflight.base);
    setBody(saved?.body ?? preflight.body);
    setDraft(saved?.draft ?? false);
    setTitle(saved?.title ?? preferredTitle);
    titleDirty.current = saved !== undefined;
    bodyDirty.current = saved !== undefined;
    initializedKey.current = draftKey;
    setFailure(undefined);
    setSkipPush(false);
  }, [draftKey, open, preferredTitle, preflight]);

  useEffect(() => {
    if (!preflight || initializedKey.current !== draftKey) return;
    const next = applyPullRequestPrefill(
      {
        body,
        bodyDirty: bodyDirty.current,
        title,
        titleDirty: titleDirty.current,
      },
      { body: preflight.body, title: preferredTitle },
    );
    setTitle(next.title);
    setBody(next.body);
  }, [body, draftKey, preferredTitle, preflight, title]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.sourceControl.createChangeRequest({
        body,
        draft,
        projectPath: preflightQuery.projectPath ?? "",
        publish: preflight?.needsPush === true && !skipPush,
        sourceBranch: preflight?.sourceBranch ?? "",
        targetBranch: base,
        title,
      }),
  });
  const close = useCallback(() => {
    if (draftKey) pullRequestDrafts.set(draftKey, { base, body, draft, title });
    onOpenChange(false);
  }, [base, body, draft, draftKey, onOpenChange, title]);
  const submit = useCallback(async () => {
    if (createMutation.isPending || title.trim().length === 0) return;
    let result: ChangeRequest;
    try {
      result = await createMutation.mutateAsync();
    } catch (error) {
      const pushed = preflight?.needsPush === true && !skipPush;
      setFailure({
        error: error instanceof Error ? error : new Error(String(error)),
        pushed,
      });
      if (pushed) setSkipPush(true);
      return;
    }
    if (draftKey) pullRequestDrafts.delete(draftKey);
    await queryClient.invalidateQueries({
      queryKey: queryKeys.sourceControl.all(),
    });
    toast({
      action: {
        label: t("workspace.tools.createPullRequest.openInBrowser"),
        onClick: () => onOpenExternal(result.webUrl),
      },
      title: t("workspace.tools.createPullRequest.created", {
        number: result.number ?? Number(result.id),
      }),
      variant: "success",
    });
    onOpenChange(false);
  }, [
    createMutation,
    draftKey,
    onOpenExternal,
    onOpenChange,
    queryClient,
    preflight,
    skipPush,
    t,
    title,
    toast,
  ]);

  const status = useMemo(() => {
    if (failure?.pushed)
      return t("workspace.tools.createPullRequest.pushedRetry");
    if (createMutation.isPending)
      return skipPush || !preflight?.needsPush
        ? t("workspace.tools.createPullRequest.creating")
        : t("workspace.tools.createPullRequest.pushing");
    if (!preflight || !preflight.needsPush) return "";
    return t(
      preflight.aheadCount === 1
        ? "workspace.tools.createPullRequest.willPushOne"
        : "workspace.tools.createPullRequest.willPushMany",
      { count: preflight.aheadCount, head: preflight.head },
    );
  }, [createMutation.isPending, failure, preflight, skipPush, t]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="gap-4 sm:max-w-2xl">
        <DialogHeader icon={<GitPullRequest />}>
          <DialogTitle>
            {preflight?.existing
              ? t("workspace.tools.createPullRequest.view", {
                  number:
                    preflight.existing.number ?? Number(preflight.existing.id),
                })
              : t("workspace.tools.createPullRequest.title")}
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
        ) : preflight?.existing ? (
          <div className="grid gap-4">
            <WorkspaceToolBanner tone="attention">
              {t("workspace.tools.createPullRequest.existing", {
                number:
                  preflight.existing.number ?? Number(preflight.existing.id),
              })}
            </WorkspaceToolBanner>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  openExistingPullRequest({
                    close: () => onOpenChange(false),
                    openExternal: onOpenExternal,
                    url: preflight.existing?.webUrl ?? "",
                  });
                }}
              >
                {t("workspace.tools.createPullRequest.openInBrowser")}
              </Button>
            </DialogFooter>
          </div>
        ) : preflight ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {!preflight.canCreate && preflight.reason ? (
              <WorkspaceToolBanner tone="attention">
                {t("workspace.tools.createPullRequest.noCommits")}
              </WorkspaceToolBanner>
            ) : null}
            {failure ? (
              <WorkspaceToolBanner tone="danger">
                {failure.error.message}
              </WorkspaceToolBanner>
            ) : null}
            <div className="flex items-center gap-2 text-sm">
              <Select
                disabled={createMutation.isPending}
                value={base}
                onValueChange={(value) => {
                  setBase(value);
                  setFailure(undefined);
                }}
              >
                <SelectTrigger
                  aria-label={t("workspace.tools.createPullRequest.base")}
                  className="min-w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {preflight.availableBaseBranches.map((branch) => (
                    <SelectItem key={branch} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <CapabilityGate
                capabilities={preflightQuery.capabilities}
                capability={
                  capabilityState(
                    preflightQuery.capabilities,
                    "changeRequests.create",
                  ).supported && preflight.needsPush
                    ? "branches.publish"
                    : "changeRequests.create"
                }
                remediationLabel={t("common.retry")}
                onRemediate={() => void preflightQuery.refetchActivation()}
              >
                <Button
                  disabled={
                    createMutation.isPending ||
                    !preflight.canCreate ||
                    title.trim().length === 0
                  }
                  type="submit"
                >
                  {createMutation.isPending ? <Spinner /> : null}
                  {failure
                    ? t("workspace.tools.createPullRequest.retry")
                    : t("workspace.tools.createPullRequest.create")}
                </Button>
              </CapabilityGate>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function toExistingTarget(
  changeRequest: ChangeRequest | null,
): ExistingPullRequestTarget | null {
  if (!changeRequest) return null;
  return {
    number: changeRequest.number ?? Number(changeRequest.id),
    url: changeRequest.webUrl,
  };
}

function titleFromBranch(branch: string) {
  return (
    branch
      .replace(/^angel\//, "")
      .replace(/^agent\//, "")
      .replace(/[-_/]+/g, " ")
      .trim() || branch
  );
}
