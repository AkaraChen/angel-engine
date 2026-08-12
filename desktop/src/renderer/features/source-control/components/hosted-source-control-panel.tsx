import type { ReactNode } from "react";

import { GitPullRequest, SpinnerGap } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSourceControlActivation } from "@/features/source-control/api/use-activation";
import { useApi } from "@/platform/use-api";

export function HostedSourceControlPanel({
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string | null;
}) {
  const api = useApi();
  const sourceControl = useSourceControlActivation(projectId);
  const { t } = useTranslation();
  const [selection, setSelection] = useState("");
  const configure = useMutation({
    mutationFn: async (candidateIndex: number) => {
      const candidate = sourceControl.candidates[candidateIndex];
      if (!candidate || !is.nonEmptyString(projectId)) {
        throw new Error("A source control remote must be selected");
      }
      await api.sourceControl.updateConfig(projectId, {
        provider: {
          providerId: candidate.providerId,
          remote: candidate.remote.name,
          ...(candidate.repository === null
            ? {}
            : { repository: candidate.repository }),
        },
      });
      await sourceControl.refetch();
    },
  });

  const providerUnavailable =
    sourceControl.status === "active" &&
    (sourceControl.authentication === "unavailable" ||
      sourceControl.unavailableReason !== null);
  if (sourceControl.status === "active" && !providerUnavailable) {
    return children;
  }
  if (sourceControl.status === "loading") return null;

  const detail = hostedFallbackDetail(sourceControl, t);
  const selectedIndex = selection === "" ? null : Number(selection);
  return (
    <div
      className="flex h-full min-h-0 items-center justify-center p-4"
      data-testid="hosted-source-control-fallback"
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
        <WorkspaceToolEmpty
          detail={detail}
          icon={GitPullRequest}
          title={t(
            sourceControl.status === "ambiguous"
              ? "workspace.tools.pullRequest.hostedFallback.ambiguousTitle"
              : "workspace.tools.pullRequest.hostedFallback.title",
          )}
        />
        {sourceControl.status === "ambiguous" ? (
          <div className="flex w-full flex-col gap-2 text-left">
            <label
              className="text-xs font-medium"
              htmlFor="source-control-remote"
            >
              {t("workspace.tools.pullRequest.hostedFallback.remoteLabel")}
            </label>
            <Select onValueChange={setSelection} value={selection}>
              <SelectTrigger className="w-full" id="source-control-remote">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {sourceControl.candidates.map((candidate, index) => (
                  <SelectItem
                    key={`${candidate.providerId}:${candidate.remote.name}:${candidate.remote.url}`}
                    value={String(index)}
                  >
                    {candidate.remote.name} · {candidate.providerId} ·{" "}
                    {candidate.remote.url}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={selectedIndex === null || configure.isPending}
              onClick={() => {
                if (selectedIndex !== null) configure.mutate(selectedIndex);
              }}
            >
              {configure.isPending ? (
                <SpinnerGap className="animate-spin" />
              ) : null}
              {configure.isPending
                ? t("workspace.tools.pullRequest.hostedFallback.saving")
                : t("workspace.tools.pullRequest.hostedFallback.apply")}
            </Button>
            {configure.isError ? (
              <p className="text-xs text-status-danger" role="alert">
                {t("workspace.tools.pullRequest.hostedFallback.errorDetail")}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              onClick={() => window.desktopWindow.openSettings()}
              variant="outline"
            >
              {t("workspace.tools.pullRequest.hostedFallback.configure")}
            </Button>
            <Button
              onClick={() => void sourceControl.refetch()}
              variant="ghost"
            >
              {t("workspace.tools.pullRequest.hostedFallback.retry")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function hostedFallbackDetail(
  sourceControl: ReturnType<typeof useSourceControlActivation>,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (sourceControl.status === "ambiguous") {
    return t("workspace.tools.pullRequest.hostedFallback.ambiguousDetail");
  }
  if (sourceControl.status === "error") {
    return t("workspace.tools.pullRequest.hostedFallback.errorDetail");
  }
  if (sourceControl.unresolvedReason === "configured-provider-missing") {
    return t(
      "workspace.tools.pullRequest.hostedFallback.configuredProviderMissing",
    );
  }
  if (sourceControl.status === "active") {
    return t("workspace.tools.pullRequest.hostedFallback.unavailableDetail");
  }
  return t("workspace.tools.pullRequest.hostedFallback.noProviderDetail");
}
