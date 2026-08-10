import type { ShepherdSession } from "@angel-engine/daemon-api/shepherd";
import type { GitHubPullRequestStatus } from "@angel-engine/daemon-api/github";
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
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { chatAmbiguousRunQueryOptions } from "@/features/chat/api/queries";
import { chatActivityListQueryOptions } from "@/features/fleet/api/queries";
import {
  isShepherdActive,
  resumeShepherdMutationOptions,
  shepherdSessionQueryOptions,
  startShepherdMutationOptions,
  stopShepherdMutationOptions,
} from "@/features/shepherd/api/queries";
import { parseGitHubPullRequestUrl } from "@/features/shepherd/parse-github-pr-url";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { cn } from "@/platform/utils";

type ShepherdHoldReason =
  | "waiting_for_you"
  | "queued_run"
  | "ambiguous_run"
  | null;

export const ShepherdSection: FC<{
  status: GitHubPullRequestStatus;
}> = ({ status }) => {
  const { active, api, chatId } = useWorkspaceToolSurface();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();

  const sessionQuery = useQuery(
    shepherdSessionQueryOptions({
      api,
      chatId,
      enabled: active && is.nonEmptyString(chatId),
    }),
  );
  const activityQuery = useQuery({
    ...chatActivityListQueryOptions({ api, enabled: active }),
  });
  const ambiguousQuery = useQuery(
    chatAmbiguousRunQueryOptions({
      api,
      chatId: chatId ?? "",
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

    if (previous === null) return;
    if (
      (previous === "watching" || previous === "queued") &&
      session?.state === "settled" &&
      session.settledReason === "stopped" &&
      is.nonEmptyString(session.id)
    ) {
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
    }
  }, [resumeMutation, session, t, toast]);

  const holdReason = resolveShepherdHoldReason({
    activityStatus: activityQuery.data?.find((item) => item.chatId === chatId)
      ?.status,
    hasAmbiguousRun: ambiguousQuery.data?.run != null,
    session,
  });

  const busy =
    startMutation.isPending ||
    stopMutation.isPending ||
    resumeMutation.isPending;
  const activeShepherd = isShepherdActive(session);
  const settled = session?.state === "settled";
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

      if (settled && session !== null && session.settledReason === "stopped") {
        await resumeMutation.mutateAsync(session.id);
        return;
      }

      const parsed = parseGitHubPullRequestUrl(status.url);
      if (parsed === null) {
        toast({
          title: t("workspace.tools.pullRequest.shepherd.startFailed"),
          description: t("workspace.tools.pullRequest.shepherd.invalidUrl"),
          variant: "destructive",
        });
        return;
      }

      await startMutation.mutateAsync({
        chatId,
        owner: parsed.owner,
        prNumber: parsed.prNumber,
        repo: parsed.repo,
      });
    } catch (error) {
      const code =
        error instanceof DaemonRequestError
          ? (error.code ?? "unknown")
          : "unknown";
      if (code === "github-cli-unauthenticated") {
        toast({
          description: t(
            "workspace.tools.pullRequest.errors.unauthenticatedDetail",
          ),
          title: t("workspace.tools.pullRequest.errors.unauthenticated"),
          variant: "destructive",
        });
        return;
      }
      toast({
        description: error instanceof Error ? error.message : String(error),
        title: t("workspace.tools.pullRequest.shepherd.actionFailed"),
        variant: "destructive",
      });
    }
  };

  const buttonLabel = (() => {
    if (busy) return t("workspace.tools.pullRequest.shepherd.working");
    if (session?.state === "queued") {
      return t("workspace.tools.pullRequest.shepherd.shepherdingStop");
    }
    if (session?.state === "watching") {
      return t("workspace.tools.pullRequest.shepherd.shepherdingStop");
    }
    if (settled && session?.settledReason === "stopped") {
      return t("workspace.tools.pullRequest.shepherd.resume");
    }
    return t("workspace.tools.pullRequest.shepherd.start");
  })();

  return (
    <section className="space-y-2 border-t border-border-subtle pt-3">
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
          <span className="text-muted-foreground">
            {t("workspace.tools.pullRequest.shepherd.rounds", {
              max: maxRounds,
              round,
            })}
          </span>
          {session?.state === "watching" ? (
            <SpinnerGap
              aria-hidden
              className="size-3.5 animate-spin text-primary"
            />
          ) : null}
        </div>
        <Button
          disabled={busy || !is.nonEmptyString(chatId)}
          onClick={() => void toggle()}
          size="sm"
          variant={activeShepherd ? "default" : "outline"}
        >
          {busy ? <SpinnerGap className="animate-spin" /> : null}
          {buttonLabel}
        </Button>
      </div>

      {session?.state === "queued" ? (
        <WorkspaceToolBanner tone="attention">
          {t("workspace.tools.pullRequest.shepherd.queued")}
        </WorkspaceToolBanner>
      ) : null}

      {session?.state === "watching" && holdReason !== null ? (
        <WorkspaceToolBanner tone="attention">
          {holdReasonCopy(holdReason, t)}
        </WorkspaceToolBanner>
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
    ) : reason === "stopped" ? (
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

  return (
    <div className="flex items-start gap-2 rounded-md border border-border-subtle bg-surface-1 px-2.5 py-2 text-xs">
      {icon}
      <div className="min-w-0">
        <div className="font-medium">
          {t(`workspace.tools.pullRequest.shepherd.settled.${reason}.title`)}
        </div>
        <p className="mt-0.5 text-muted-foreground">
          {t(`workspace.tools.pullRequest.shepherd.settled.${reason}.detail`)}
        </p>
      </div>
    </div>
  );
};

function resolveShepherdHoldReason(input: {
  activityStatus: string | undefined;
  hasAmbiguousRun: boolean;
  session: ShepherdSession | null;
}): ShepherdHoldReason {
  if (input.session?.state !== "watching") return null;
  if (input.hasAmbiguousRun) return "ambiguous_run";
  if (input.activityStatus === "waiting_for_you") return "waiting_for_you";
  // Queued chat runs are not projected on activity; when the daemon holds for
  // them the session stays watching with no pending prompt. Surface a generic
  // wait only when activity is mid-flight in a non-running form we already
  // mapped above — otherwise stay quiet so normal watching is not noisy.
  return null;
}

function holdReasonCopy(
  reason: Exclude<ShepherdHoldReason, null>,
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
