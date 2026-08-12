import type { ShepherdSession } from "@angel-engine/daemon-api/shepherd";
import type { ChangeRequest } from "@angel-engine/daemon-api/source-control";
import type { FC } from "react";

import { DaemonRequestError } from "@angel-engine/daemon-client";
import { DEFAULT_SHEPHERD_MAX_ROUNDS } from "@angel-engine/daemon-api/shepherd";
import {
  Binoculars,
  CheckCircle,
  PauseCircle,
  SpinnerGap,
  StopCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { Button } from "@/components/ui/button";
import { useSourceControlActivation } from "@/features/source-control/api/use-activation";
import { CapabilityGate } from "@/features/source-control/components/capability-gate";
import { capabilityState } from "@/features/source-control/model";
import { useToast } from "@/components/ui/toast";
import {
  isShepherdActive,
  resumeShepherdMutationOptions,
  shepherdSessionQueryOptions,
  startShepherdMutationOptions,
  stopShepherdMutationOptions,
} from "@/features/shepherd/api/queries";
import { resolveShepherdTarget } from "@/features/shepherd/resolve-shepherd-target";
import {
  isResumableShepherdSession,
  shepherdHoldReason,
  shouldShowShepherdYieldToast,
} from "@/features/shepherd/shepherd-projection";
import { cn } from "@/platform/utils";

export const ShepherdSection: FC<{
  changeRequest: ChangeRequest;
  projectId: string | null;
}> = ({ changeRequest, projectId }) => {
  const { active, api, chatId } = useWorkspaceToolSurface();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();
  const sourceControl = useSourceControlActivation(projectId);
  const linkCapability = capabilityState(
    sourceControl.capabilities,
    "changeRequests.getByUrl",
  );
  const canResolveTarget =
    sourceControl.status === "active" &&
    is.nonEmptyString(sourceControl.projectPath) &&
    linkCapability.supported;

  const sessionQuery = useQuery(
    shepherdSessionQueryOptions({
      api,
      chatId,
      enabled: active && is.nonEmptyString(chatId),
    }),
  );

  const startMutation = useMutation(
    startShepherdMutationOptions({ api, queryClient }),
  );
  const stopMutation = useMutation(
    stopShepherdMutationOptions({ api, queryClient }),
  );
  const resumeMutation = useMutation(
    resumeShepherdMutationOptions({ api, queryClient }),
  );

  const session = sessionQuery.data?.session ?? null;
  const previousStateRef = useRef<ShepherdSession["state"] | "off" | null>(
    null,
  );

  useEffect(() => {
    const nextState = session?.state ?? "off";
    const previous = previousStateRef.current;
    previousStateRef.current = nextState;

    if (!shouldShowShepherdYieldToast(previous, session)) return;
    if (session === null || !is.nonEmptyString(session.id)) return;

    const sessionId = session.id;
    toast({
      action: {
        label: t("workspace.tools.pullRequest.shepherd.resume"),
        onClick: () => {
          void resumeMutation.mutateAsync(sessionId).catch((error) => {
            toast({
              description:
                error instanceof Error ? error.message : String(error),
              title: t("workspace.tools.pullRequest.shepherd.resumeFailed"),
              variant: "destructive",
            });
          });
        },
      },
      description: t("workspace.tools.pullRequest.shepherd.yieldedDetail"),
      duration: 15_000,
      title: t("workspace.tools.pullRequest.shepherd.yielded"),
      variant: "attention",
    });
  }, [resumeMutation, session, t, toast]);

  const holdReason = shepherdHoldReason(session);
  const busy =
    startMutation.isPending ||
    stopMutation.isPending ||
    resumeMutation.isPending;
  const activeShepherd = isShepherdActive(session);
  const settled = session?.state === "settled";
  const resumable = isResumableShepherdSession(session);
  const round = session?.round ?? 0;
  const maxRounds = session?.maxRounds ?? DEFAULT_SHEPHERD_MAX_ROUNDS;

  const toggle = async () => {
    if (!is.nonEmptyString(chatId)) {
      toast({
        title: t("workspace.tools.pullRequest.shepherd.noChat"),
        variant: "destructive",
      });
      return;
    }

    try {
      if (activeShepherd && session !== null) {
        await stopMutation.mutateAsync(session.id);
        return;
      }

      if (resumable && session !== null) {
        await resumeMutation.mutateAsync(session.id);
        return;
      }

      if (!canResolveTarget || !is.nonEmptyString(sourceControl.projectPath)) {
        return;
      }
      const target = await resolveShepherdTarget({
        api,
        projectPath: sourceControl.projectPath,
        url: changeRequest.webUrl,
      });
      if (target === null) {
        toast({
          title: t("workspace.tools.pullRequest.shepherd.startFailed"),
          description: t("workspace.tools.pullRequest.shepherd.invalidUrl"),
          variant: "destructive",
        });
        return;
      }

      await startMutation.mutateAsync({
        chatId,
        ...target,
      });
    } catch (error) {
      const code =
        error instanceof DaemonRequestError
          ? (error.code ?? "unknown")
          : "unknown";
      if (code === "source-control/unauthenticated") {
        toast({
          description: t(
            "workspace.tools.pullRequest.errors.unauthenticatedDetail",
          ),
          title: t("workspace.tools.pullRequest.errors.unauthenticated"),
          variant: "destructive",
        });
        return;
      }
      if (
        code === "source-control/url-unsupported" ||
        code === "source-control/item-not-found"
      ) {
        toast({
          description: t("workspace.tools.pullRequest.shepherd.invalidUrl"),
          title: t("workspace.tools.pullRequest.shepherd.startFailed"),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t("workspace.tools.pullRequest.shepherd.actionFailed"),
        variant: "destructive",
      });
    }
  };

  const buttonLabel = (() => {
    if (busy) return t("workspace.tools.pullRequest.shepherd.working");
    if (session?.state === "queued" || session?.state === "watching") {
      return t("workspace.tools.pullRequest.shepherd.shepherdingStop");
    }
    if (resumable) {
      return t("workspace.tools.pullRequest.shepherd.resume");
    }
    return t("workspace.tools.pullRequest.shepherd.start");
  })();

  return (
    <section
      className="space-y-2 border-t border-border-subtle pt-3"
      data-testid="shepherd-section"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Binoculars
            className={cn(
              "size-3.5 shrink-0",
              activeShepherd ? "text-primary" : "text-muted-foreground",
            )}
            weight={activeShepherd ? "fill" : "regular"}
          />
          <span>{t("workspace.tools.pullRequest.shepherd.title")}</span>
          <span className="text-muted-foreground" data-testid="shepherd-rounds">
            {t("workspace.tools.pullRequest.shepherd.rounds", {
              max: maxRounds,
              round,
            })}
          </span>
          {session?.state === "watching" ? (
            <SpinnerGap
              aria-hidden
              className="size-3.5 animate-spin text-primary"
              data-testid="shepherd-watching-pulse"
            />
          ) : null}
        </div>
        {canResolveTarget || activeShepherd || resumable ? (
          <Button
            data-testid="shepherd-toggle"
            disabled={busy || !is.nonEmptyString(chatId)}
            onClick={() => void toggle()}
            size="sm"
            variant={activeShepherd ? "default" : "outline"}
          >
            {busy ? <SpinnerGap className="animate-spin" /> : null}
            {buttonLabel}
          </Button>
        ) : (
          <CapabilityGate
            capabilities={sourceControl.capabilities}
            capability="changeRequests.getByUrl"
            onRemediate={() => void sourceControl.refetch()}
            remediationLabel={t("common.retry")}
          >
            <Button
              data-testid="shepherd-toggle"
              disabled={busy || !is.nonEmptyString(chatId)}
              onClick={() => void toggle()}
              size="sm"
              variant="outline"
            >
              {busy ? <SpinnerGap className="animate-spin" /> : null}
              {buttonLabel}
            </Button>
          </CapabilityGate>
        )}
      </div>

      {session?.state === "queued" ? (
        <div data-testid="shepherd-queued">
          <WorkspaceToolBanner tone="attention">
            {t("workspace.tools.pullRequest.shepherd.queued")}
          </WorkspaceToolBanner>
        </div>
      ) : null}

      {session?.state === "watching" && holdReason !== null ? (
        <div data-testid={`shepherd-hold-${holdReason}`}>
          <WorkspaceToolBanner tone="attention">
            {holdReasonCopy(holdReason, t)}
          </WorkspaceToolBanner>
        </div>
      ) : null}

      {settled && session?.settledReason !== null ? (
        <SettledCard reason={session.settledReason} />
      ) : null}
    </section>
  );
};

const SettledCard: FC<{
  reason: NonNullable<ShepherdSession["settledReason"]>;
}> = ({ reason }) => {
  const { t } = useTranslation();
  const icon =
    reason === "green" ? (
      <CheckCircle
        className="size-4 shrink-0 text-status-success"
        weight="fill"
      />
    ) : reason === "stopped" || reason === "yielded" ? (
      <PauseCircle
        className="size-4 shrink-0 text-status-attention"
        weight="fill"
      />
    ) : reason === "budget" || reason === "blocked" ? (
      <WarningCircle
        className="size-4 shrink-0 text-status-attention"
        weight="fill"
      />
    ) : (
      <StopCircle
        className="size-4 shrink-0 text-muted-foreground"
        weight="fill"
      />
    );

  const copyKey = reason === "yielded" ? "stopped" : reason;

  return (
    <div
      className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-1 px-2.5 py-2 text-xs"
      data-testid={`shepherd-settled-${reason}`}
    >
      {icon}
      <div className="min-w-0">
        <div className="font-medium">
          {t(`workspace.tools.pullRequest.shepherd.settled.${copyKey}.title`)}
        </div>
        <p className="mt-0.5 text-muted-foreground">
          {t(`workspace.tools.pullRequest.shepherd.settled.${copyKey}.detail`)}
        </p>
      </div>
    </div>
  );
};

function holdReasonCopy(
  reason: NonNullable<ReturnType<typeof shepherdHoldReason>>,
  t: ReturnType<typeof useTranslation>["t"],
) {
  switch (reason) {
    case "ambiguous_run":
      return t("workspace.tools.pullRequest.shepherd.hold.ambiguous");
    case "queued_run":
      return t("workspace.tools.pullRequest.shepherd.hold.queuedRun");
    case "waiting_for_you":
      return t("workspace.tools.pullRequest.shepherd.hold.waitingForYou");
  }
}
