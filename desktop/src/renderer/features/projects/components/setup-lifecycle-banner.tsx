import type { FC, ReactNode } from "react";

import {
  CheckCircle,
  CaretDown,
  CaretUp,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  setupLifecycleMutationOptions,
  setupLifecycleQueryOptions,
} from "@/features/projects/api/setup-lifecycle";
import { useApi } from "@/platform/use-api";

interface SetupLifecycleBannerProps {
  chatId: string;
  enabled: boolean;
  onDiscarded: () => void;
}

export const SetupLifecycleBanner: FC<SetupLifecycleBannerProps> = ({
  chatId,
  enabled,
  onDiscarded,
}) => {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [paneOpen, setPaneOpen] = useState(false);
  const lifecycle = useQuery(
    setupLifecycleQueryOptions({ api, chatId, enabled }),
  );
  const retry = useMutation(
    setupLifecycleMutationOptions({
      action: "retry",
      api,
      chatId,
      queryClient,
    }),
  );
  const continueSetup = useMutation(
    setupLifecycleMutationOptions({
      action: "continue",
      api,
      chatId,
      queryClient,
    }),
  );
  const cancel = useMutation(
    setupLifecycleMutationOptions({
      action: "cancel",
      api,
      chatId,
      queryClient,
    }),
  );
  const discard = useMutation({
    ...setupLifecycleMutationOptions({
      action: "discard",
      api,
      chatId,
      queryClient,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["chats"] });
      onDiscarded();
    },
  });

  if (!enabled || lifecycle.isPending) return null;
  if (lifecycle.isError) {
    return (
      <LifecycleShell danger>
        <WarningCircle className="size-4 shrink-0" />
        <span>{getErrorMessage(lifecycle.error)}</span>
      </LifecycleShell>
    );
  }

  const view = lifecycle.data;
  const setup = view.snapshot.setup;
  if (setup.status === "idle" || view.continued) return null;
  const pending =
    retry.isPending ||
    continueSetup.isPending ||
    cancel.isPending ||
    discard.isPending;

  return (
    <div className="shrink-0 border-b border-border-subtle bg-background px-4 py-2 sm:px-7">
      <div className="mx-auto w-full max-w-3xl">
        {setup.status === "failed" ? (
          <div
            className="rounded-xl border border-status-danger-border bg-status-danger-soft p-3"
            data-testid="lifecycle-error-card"
            role="alert"
          >
            <div className="flex items-start gap-2 text-sm">
              <WarningCircle className="mt-0.5 size-4 shrink-0 text-status-danger" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {t("workspace.setup.failedTitle")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t("workspace.setup.failedStep", {
                    command: setup.command,
                    exitCode: setup.failure.exitCode ?? setup.failure.signal,
                    step: setup.step,
                    total: setup.stepCount,
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    data-testid="lifecycle-retry"
                    disabled={pending}
                    size="sm"
                    onClick={() => retry.mutate()}
                  >
                    {t("workspace.setup.retry")}
                  </Button>
                  <Button
                    data-testid="lifecycle-continue"
                    disabled={pending}
                    size="sm"
                    variant="outline"
                    onClick={() => continueSetup.mutate()}
                  >
                    {t("workspace.setup.continueAnyway")}
                  </Button>
                  <Button
                    data-testid="lifecycle-discard"
                    disabled={pending}
                    size="sm"
                    variant="ghost"
                    onClick={() => discard.mutate()}
                  >
                    {t("workspace.setup.discard")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <LifecycleShell>
            {setup.status === "ready" ? (
              <CheckCircle className="size-4 shrink-0 text-status-success" />
            ) : (
              <Spinner className="size-4" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {setup.status === "ready"
                  ? t("workspace.setup.ready")
                  : t("workspace.setup.running")}
              </div>
              {setup.status === "running" ? (
                <div
                  className="truncate text-xs text-muted-foreground"
                  data-testid="lifecycle-banner-step"
                >
                  {t("workspace.setup.runningStep", {
                    command: setup.command,
                    step: setup.step,
                    total: setup.stepCount,
                  })}
                </div>
              ) : null}
            </div>
            {setup.status === "running" ? (
              <Button
                disabled={pending}
                size="sm"
                variant="ghost"
                onClick={() => cancel.mutate()}
              >
                {t("common.cancel")}
              </Button>
            ) : null}
          </LifecycleShell>
        )}
        <Button
          className="mt-1 h-7 px-2 text-xs"
          size="sm"
          variant="ghost"
          onClick={() => setPaneOpen((current) => !current)}
        >
          {paneOpen ? <CaretUp /> : <CaretDown />}
          {t("workspace.setup.viewLog")}
        </Button>
        {paneOpen ? (
          <pre
            className="mt-1 max-h-48 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap"
            data-testid="lifecycle-pane"
          >
            {view.log || t("workspace.setup.noLog")}
          </pre>
        ) : null}
      </div>
    </div>
  );
};

const LifecycleShell: FC<{
  children: ReactNode;
  danger?: boolean;
}> = ({ children, danger = false }) => (
  <div
    className={
      danger
        ? "flex items-center gap-2 rounded-lg text-sm text-status-danger"
        : "flex items-center gap-2 rounded-lg text-sm"
    }
    data-testid="lifecycle-banner"
  >
    {children}
  </div>
);
