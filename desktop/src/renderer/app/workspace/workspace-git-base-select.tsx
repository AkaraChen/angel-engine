import type {
  WorkspaceGitDiffBaseKind,
  WorkspaceGitDiffBaseOption,
  WorkspaceGitDiffUnavailableReason,
  WorkspaceGitResolvedBase,
} from "@angel-engine/daemon-api/workspace-tools";
import type { TFunction } from "i18next";
import type { ChangeEvent, FC, ReactNode } from "react";

import { useTranslation } from "react-i18next";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

type WorkspaceGitBaseSelectProps = {
  bases: WorkspaceGitDiffBaseOption[];
  resolvedBase: WorkspaceGitResolvedBase;
  summary?: ReactNode;
  value: WorkspaceGitDiffBaseKind;
  onChange: (kind: WorkspaceGitDiffBaseKind) => void;
};

export const WorkspaceGitBaseSelect: FC<WorkspaceGitBaseSelectProps> = ({
  bases,
  resolvedBase,
  summary,
  value,
  onChange,
}) => {
  const { t } = useTranslation();
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onChange(event.currentTarget.value as WorkspaceGitDiffBaseKind);
  };
  return (
    <div
      className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1"
      data-slot="workspace-git-base-select"
    >
      <span className="shrink-0 text-xs text-muted-foreground">
        {t("workspace.tools.diffBase.label")}
      </span>
      <NativeSelect
        aria-label={t("workspace.tools.diffBase.label")}
        className="w-full min-w-0"
        selectClassName="h-7 w-full min-w-32 font-mono text-xs"
        size="sm"
        value={value}
        onChange={handleChange}
      >
        {bases.map((base) => (
          <NativeSelectOption
            disabled={!base.available}
            key={base.kind}
            value={base.kind}
          >
            {t(`workspace.tools.diffBase.${base.kind}`)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {resolvedBase.shortSha || summary ? (
        <div
          className="col-span-2 flex min-w-0 items-center justify-between gap-2"
          data-slot="workspace-git-base-details"
        >
          {resolvedBase.shortSha ? (
            <span
              className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums"
              title={[
                resolvedBase.fullSha,
                resolvedBase.subject,
                resolvedBase.commitTime,
              ]
                .filter(Boolean)
                .join("\n")}
            >
              {resolvedBase.shortSha}
            </span>
          ) : (
            <span />
          )}
          {summary}
        </div>
      ) : null}
    </div>
  );
};

export function formatWorkspaceGitDiffUnavailableReason({
  fallbackKind,
  reason,
  requestedKind,
  t,
}: {
  fallbackKind: WorkspaceGitDiffBaseKind;
  reason: WorkspaceGitDiffUnavailableReason;
  requestedKind: WorkspaceGitDiffBaseKind;
  t: TFunction;
}) {
  const base = t(
    `workspace.tools.diffBase.${reason.anchorKind ?? requestedKind}`,
  );
  const fallback = t(`workspace.tools.diffBase.${fallbackKind}`);
  switch (reason.code) {
    case "anchor-missing":
      return t("workspace.tools.diffBase.fallback.anchorMissing", {
        base,
        fallback,
        sha: reason.shortSha,
      });
    case "anchor-unavailable":
      return t("workspace.tools.diffBase.fallback.anchorUnavailable", {
        base,
        fallback,
      });
    case "default-branch-unavailable":
      return t("workspace.tools.diffBase.fallback.defaultBranchUnavailable", {
        fallback,
      });
    case "git-ref-unavailable":
      return t("workspace.tools.diffBase.fallback.gitRefUnavailable", {
        fallback,
        ref: reason.ref,
      });
    case "no-merge-base":
      return t("workspace.tools.diffBase.fallback.noMergeBase", {
        fallback,
        ref: reason.ref,
      });
    case "not-a-repository":
      return t("workspace.tools.diffBase.fallback.notRepository");
  }
}
