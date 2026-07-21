import type { ReactNode } from "react";
import type { WorkspaceGitStatus } from "@/platform/workspace-types";

import {
  ArrowClockwise,
  FolderOpen,
  GitBranch,
  Warning,
} from "@phosphor-icons/react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

import { useChatWorkspaceRoot, useWorkspaceGitStatus } from "./use-workspace";

/**
 * A simplified, mobile-first workspace tool panel, reachable from the chat
 * header. Unlike the desktop's persistent side panel it surfaces only the
 * essentials — the current worktree, branch, and a live git status summary — in
 * a bottom sheet, backed by the same daemon workspace-tools API
 * (`GET /api/workspace/git-diff`).
 */
export function WorkspacePanel({ chatId }: { chatId: string }) {
  const [open, setOpen] = useState(false);
  const { root } = useChatWorkspaceRoot(chatId);
  const status = useWorkspaceGitStatus(root, open);

  return (
    <Drawer onOpenChange={setOpen} open={open}>
      <DrawerTrigger asChild>
        <Button aria-label="Workspace" size="icon" variant="ghost">
          <GitBranch size={18} />
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="flex-row items-center justify-between gap-2 text-left">
          <div className="min-w-0">
            <DrawerTitle>Workspace</DrawerTitle>
            <DrawerDescription className="truncate">
              {root !== null ? workspaceName(root) : "No workspace"}
            </DrawerDescription>
          </div>
          {root !== null ? (
            <Button
              aria-label="Refresh"
              disabled={status.isFetching}
              onClick={() => void status.refetch()}
              size="icon"
              variant="ghost"
            >
              <ArrowClockwise
                className={cn(status.isFetching && "animate-spin")}
                size={18}
              />
            </Button>
          ) : null}
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {root === null ? (
            <PanelNotice
              icon={<FolderOpen size={24} />}
              text="This chat isn't bound to a workspace directory."
            />
          ) : status.isPending ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : status.isError ? (
            <PanelNotice
              icon={<Warning size={24} />}
              text="Couldn't reach the workspace. The daemon may be offline."
            />
          ) : status.data.isGitRepository === false ? (
            <PanelNotice
              icon={<FolderOpen size={24} />}
              text="This workspace isn't a Git repository."
            />
          ) : (
            <WorkspaceStatus data={status.data} root={root} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function WorkspaceStatus({
  data,
  root,
}: {
  data: NonNullable<ReturnType<typeof useWorkspaceGitStatus>["data"]>;
  root: string;
}) {
  const entries = data.status;
  const stagedCount = entries.filter((entry) => entry.staged).length;
  const unstagedCount = entries.filter(
    (entry) => entry.unstaged || entry.status === "untracked",
  ).length;

  return (
    <div className="space-y-4 pb-2">
      <div className="space-y-2">
        <MetaRow icon={<GitBranch size={16} />} label="Branch">
          <span className="font-mono text-xs">
            {data.branch !== undefined && data.branch.length > 0
              ? data.branch
              : "detached"}
          </span>
        </MetaRow>
        <MetaRow icon={<FolderOpen size={16} />} label="Root">
          <span className="truncate font-mono text-xs" title={root}>
            {workspaceName(root)}
          </span>
        </MetaRow>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge variant="secondary">{stagedCount} staged</Badge>
        <Badge variant="secondary">{unstagedCount} unstaged</Badge>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Working tree clean — no changes.
        </p>
      ) : (
        <ul className="space-y-1">
          {entries.map((entry) => (
            <li
              className="flex items-center gap-2 rounded-lg p-1"
              key={entry.path}
            >
              <StatusMark status={entry.status} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">
                {entry.path}
              </span>
              {entry.staged ? (
                <span className="shrink-0 text-[10px] font-medium text-muted-foreground uppercase">
                  staged
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {data.warnings.length > 0 ? (
        <div className="rounded-lg bg-muted/40 p-2 text-xs text-muted-foreground">
          {data.warnings.join(" ")}
        </div>
      ) : null}
    </div>
  );
}

function MetaRow({
  children,
  icon,
  label,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

const STATUS_META: Record<
  WorkspaceGitStatus,
  { label: string; className: string }
> = {
  added: {
    label: "A",
    className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  deleted: { label: "D", className: "bg-destructive/15 text-destructive" },
  ignored: { label: "I", className: "bg-muted text-muted-foreground" },
  modified: {
    label: "M",
    className: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  renamed: {
    label: "R",
    className: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  },
  untracked: { label: "U", className: "bg-muted text-muted-foreground" },
};

function StatusMark({ status }: { status: WorkspaceGitStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-semibold",
        meta.className,
      )}
      title={status}
    >
      {meta.label}
    </span>
  );
}

function PanelNotice({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
      {icon}
      <p className="max-w-xs text-sm">{text}</p>
    </div>
  );
}

/** The trailing path segment of a workspace root, for a compact label. */
function workspaceName(root: string): string {
  const trimmed = root.replace(/[/\\]+$/, "");
  const segments = trimmed.split(/[/\\]/);
  return segments[segments.length - 1] || trimmed;
}
