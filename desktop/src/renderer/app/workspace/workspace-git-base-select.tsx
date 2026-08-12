import type {
  WorkspaceGitDiffBaseKind,
  WorkspaceGitDiffBaseOption,
  WorkspaceGitDiffUnavailableReason,
  WorkspaceGitResolvedBase,
} from "@angel-engine/daemon-api/workspace-tools";
import type { TFunction } from "i18next";
import type { FC, ReactNode } from "react";

import { Copy } from "@phosphor-icons/react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

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
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "[" && event.key !== "]") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      const next = nextAvailableWorkspaceGitBase(
        bases,
        value,
        event.key === "]" ? 1 : -1,
      );
      if (next === value) return;
      event.preventDefault();
      onChange(next);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bases, onChange, value]);
  return (
    <div
      className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1"
      data-slot="workspace-git-base-select"
    >
      <span className="shrink-0 text-xs text-muted-foreground">
        {t("workspace.tools.diffBase.label")}
      </span>
      <Select
        value={value}
        onValueChange={(nextValue) =>
          onChange(nextValue as WorkspaceGitDiffBaseKind)
        }
      >
        <SelectTrigger
          aria-label={t("workspace.tools.diffBase.label")}
          className="h-7 w-full min-w-32 font-mono text-xs"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {bases.map((base) => (
            <SelectItem
              disabled={!base.available}
              key={base.kind}
              value={base.kind}
            >
              {t(`workspace.tools.diffBase.${base.kind}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {resolvedBase.shortSha || summary ? (
        <div
          className="col-span-2 flex min-w-0 items-center justify-between gap-2"
          data-slot="workspace-git-base-details"
        >
          {resolvedBase.shortSha ? (
            <Button
              aria-label={`${t("common.copy")} ${resolvedBase.shortSha}`}
              className="h-7 gap-1 px-1.5 font-mono text-xs tabular-nums"
              size="sm"
              title={[
                resolvedBase.fullSha,
                resolvedBase.subject,
                resolvedBase.commitTime,
              ]
                .filter(Boolean)
                .join("\n")}
              type="button"
              variant="ghost"
              onClick={() => {
                if (resolvedBase.fullSha) {
                  void navigator.clipboard.writeText(resolvedBase.fullSha);
                }
              }}
            >
              <Copy aria-hidden="true" className="size-3" />
              {resolvedBase.shortSha}
            </Button>
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

export function nextAvailableWorkspaceGitBase(
  bases: WorkspaceGitDiffBaseOption[],
  current: WorkspaceGitDiffBaseKind,
  direction: -1 | 1,
): WorkspaceGitDiffBaseKind {
  const available = bases.filter((base) => base.available);
  if (available.length === 0) return current;
  const currentIndex = available.findIndex((base) => base.kind === current);
  const startIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex =
    (startIndex + direction + available.length) % available.length;
  return available[nextIndex]?.kind ?? current;
}
