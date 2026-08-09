import type { WorkspaceGitBranchStatus } from "@angel-engine/daemon-api/workspace-tools";
import type { ReactNode } from "react";

import { DaemonRequestError } from "@angel-engine/daemon-client";
import { ArrowDown, ArrowUp, GitBranch, Warning } from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import { WorkspaceToolBanner } from "@/app/workspace/workspace-tool-layout";
import { Button } from "@/components/ui/button";

/**
 * The source-control status line: where the branch sits relative to its
 * upstream, how dirty the tree is, and the one action that moves work off the
 * machine. Commit lives in the composer at the bottom of the same column.
 */
export function WorkspaceGitStatusBar({
  branchStatus,
  conflictedPaths,
  dirtyCount,
  pushError,
  pushPending,
  onPush,
}: {
  branchStatus: WorkspaceGitBranchStatus;
  conflictedPaths: string[];
  dirtyCount: number;
  pushError?: unknown;
  pushPending: boolean;
  onPush: () => void;
}) {
  const { t } = useTranslation();
  const { ahead, behind, branch, detached, upstream } = branchStatus;
  const hasBranch = is.nonEmptyString(branch);
  const hasUpstream = is.nonEmptyString(upstream);
  const canPush = hasBranch && !detached && (!hasUpstream || ahead > 0);
  const branchLabel = detached
    ? t("workspace.tools.git.detached")
    : hasBranch
      ? branch
      : t("workspace.tools.git.noCommits");

  return (
    <div className="shrink-0 border-b border-border-subtle">
      <div className="flex h-8 items-center gap-2 px-3 text-xs">
        <GitBranch
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground"
          weight="duotone"
        />
        <span className="min-w-0 truncate font-mono" title={upstream}>
          {branchLabel}
        </span>
        {ahead > 0 ? (
          <WorkspaceGitCounter
            icon={<ArrowUp aria-hidden="true" className="size-3" />}
            label={t("workspace.tools.git.ahead", { value: ahead })}
            value={ahead}
          />
        ) : null}
        {behind > 0 ? (
          <WorkspaceGitCounter
            icon={<ArrowDown aria-hidden="true" className="size-3" />}
            label={t("workspace.tools.git.behind", { value: behind })}
            value={behind}
          />
        ) : null}
        {hasBranch && !hasUpstream && !detached ? (
          <span className="shrink-0 text-muted-foreground">
            {t("workspace.tools.git.noUpstream")}
          </span>
        ) : null}
        <span className="min-w-0 flex-1 truncate text-right text-muted-foreground">
          {dirtyCount > 0
            ? t("workspace.tools.git.dirty", { value: dirtyCount })
            : t("workspace.tools.git.clean")}
        </span>
        <Button
          disabled={!canPush || pushPending}
          onClick={onPush}
          size="xs"
          type="button"
          variant="secondary"
        >
          {pushPending
            ? t("workspace.tools.git.pushing")
            : hasUpstream
              ? t("workspace.tools.git.push")
              : t("workspace.tools.git.publish")}
        </Button>
      </div>
      {conflictedPaths.length > 0 ? (
        <WorkspaceToolBanner className="m-3 mb-0" tone="attention">
          <div className="flex items-center gap-1.5 font-medium">
            <Warning aria-hidden="true" className="size-3.5" />
            {t("workspace.tools.git.conflicts", {
              value: conflictedPaths.length,
            })}
          </div>
          <div className="font-mono">{conflictedPaths.join(", ")}</div>
        </WorkspaceToolBanner>
      ) : null}
      {pushError === undefined || pushError === null ? null : (
        <WorkspaceToolBanner className="m-3 mb-0" tone="danger">
          <div>{getErrorMessage(pushError)}</div>
          <WorkspaceGitPushHint error={pushError} />
        </WorkspaceToolBanner>
      )}
    </div>
  );
}

function WorkspaceGitCounter({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center gap-0.5 tabular-nums"
      title={label}
    >
      {icon}
      {value}
    </span>
  );
}

/**
 * A push fails for reasons the user, not the app, has to fix. The daemon
 * classifies the git stderr into a code so the banner can say what to do next
 * instead of only echoing git.
 */
function WorkspaceGitPushHint({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const code = error instanceof DaemonRequestError ? error.code : undefined;
  const hint =
    code === "workspace-git-auth-failed"
      ? t("workspace.tools.git.pushHint.auth")
      : code === "workspace-git-network-failed"
        ? t("workspace.tools.git.pushHint.network")
        : code === "workspace-git-push-rejected"
          ? t("workspace.tools.git.pushHint.rejected")
          : code === "workspace-git-no-remote"
            ? t("workspace.tools.git.pushHint.noRemote")
            : code === "workspace-git-detached-head"
              ? t("workspace.tools.git.pushHint.detached")
              : undefined;

  return is.nonEmptyString(hint) ? (
    <div className="text-muted-foreground">{hint}</div>
  ) : null;
}
