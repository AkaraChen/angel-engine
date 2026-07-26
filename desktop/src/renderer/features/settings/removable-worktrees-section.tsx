import type {
  ManagedWorktreeSummary,
  Project,
} from "@angel-engine/daemon-api/projects";
import type { FC } from "react";
import {
  ArrowClockwise,
  GitBranch,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { broadcastChatsChanged } from "@/features/chat/chat-metadata-events";
import {
  deleteManagedWorktreesMutationOptions,
  managedWorktreeListQueryOptions,
} from "@/features/settings/api/managed-worktrees";
import { useApi } from "@/platform/use-api";

const EMPTY_WORKTREES: ManagedWorktreeSummary[] = [];

type RemovableWorktreesSectionProps = {
  projectsById: ReadonlyMap<string, Project>;
};

export const RemovableWorktreesSection: FC<RemovableWorktreesSectionProps> = ({
  projectsById,
}) => {
  const api = useApi();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const toast = useToast();
  const worktreesQuery = useQuery({
    ...managedWorktreeListQueryOptions({ api }),
  });
  const deleteWorktreesMutation = useMutation({
    ...deleteManagedWorktreesMutationOptions({ api, queryClient }),
  });
  const worktrees = worktreesQuery.data ?? EMPTY_WORKTREES;

  async function deleteWorktree(worktree: ManagedWorktreeSummary) {
    try {
      const confirmed =
        await window.desktopWindow.confirmDeleteManagedWorktrees({
          chatCount: worktree.archivedChatCount,
          managedWorktreeCount: worktree.existsOnDisk ? 1 : 0,
        });
      if (!confirmed) return;

      const result = await deleteWorktreesMutation.mutateAsync({
        targets: [
          {
            expectedChatIds: worktree.chatIds,
            expectedExistsOnDisk: worktree.existsOnDisk,
            path: worktree.path,
          },
        ],
      });
      broadcastChatsChanged();
      toast({
        description:
          result.failedWorktrees.length > 0
            ? t("settings.archived.removableWorktrees.partialFailure", {
                count: result.failedWorktrees.length,
              })
            : undefined,
        title: t("settings.archived.removableWorktrees.deletedToast", {
          chatCount: result.deletedChatCount,
          worktreeCount: result.deletedWorktreeCount,
        }),
        variant: result.failedWorktrees.length > 0 ? "destructive" : undefined,
      });
    } catch (error) {
      await worktreesQuery.refetch();
      toast({
        description: error instanceof Error ? error.message : String(error),
        title: t("settings.archived.removableWorktrees.deleteFailed"),
        variant: "destructive",
      });
    }
  }

  return (
    <section aria-labelledby="removable-worktrees-title" className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-medium" id="removable-worktrees-title">
            {t("settings.archived.removableWorktrees.title")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {t("settings.archived.removableWorktrees.description")}
          </p>
        </div>
        <Button
          disabled={
            worktreesQuery.isFetching || deleteWorktreesMutation.isPending
          }
          onClick={() => void worktreesQuery.refetch()}
          size="sm"
          type="button"
          variant="outline"
        >
          <ArrowClockwise />
          {t("settings.archived.removableWorktrees.scanAgain")}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {worktreesQuery.isPending ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : worktreesQuery.isError ? (
          <div className="flex items-start justify-between gap-4 px-4 py-6">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-medium text-destructive">
                {t("common.failed")}
              </div>
              <div className="text-xs wrap-break-word text-muted-foreground">
                {worktreesQuery.error instanceof Error
                  ? worktreesQuery.error.message
                  : String(worktreesQuery.error)}
              </div>
            </div>
            <Button
              onClick={() => void worktreesQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("common.reload")}
            </Button>
          </div>
        ) : worktrees.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t("settings.archived.removableWorktrees.empty")}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {worktrees.map((worktree) => (
              <RemovableWorktreeRow
                disabled={deleteWorktreesMutation.isPending}
                key={worktree.path}
                onDelete={() => void deleteWorktree(worktree)}
                project={
                  worktree.projectId === null
                    ? undefined
                    : projectsById.get(worktree.projectId)
                }
                worktree={worktree}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

type RemovableWorktreeRowProps = {
  disabled: boolean;
  onDelete: () => void;
  project?: Project;
  worktree: ManagedWorktreeSummary;
};

const RemovableWorktreeRow: FC<RemovableWorktreeRowProps> = ({
  disabled,
  onDelete,
  project,
  worktree,
}) => {
  const { t } = useTranslation();
  const projectName = project
    ? getProjectDisplayName(project.path)
    : worktree.projectSlug;

  return (
    <article className="flex min-w-0 items-start gap-3 px-4 py-3">
      <GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-medium">
            {projectName}
          </span>
          {!worktree.existsOnDisk ? (
            <span
              className="
                inline-flex shrink-0 items-center gap-1 rounded-sm bg-muted
                px-1.5 py-0.5 text-[11px] text-muted-foreground
              "
            >
              <WarningCircle className="size-3" />
              {t("settings.archived.removableWorktrees.missingOnDisk")}
            </span>
          ) : null}
        </div>
        <div
          className="mt-1 truncate text-xs text-muted-foreground"
          title={worktree.path}
        >
          {worktree.path}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {t("settings.archived.removableWorktrees.sessionCount", {
            count: worktree.archivedChatCount,
          })}
        </div>
      </div>
      <Button
        disabled={disabled}
        onClick={onDelete}
        size="sm"
        type="button"
        variant="destructive"
      >
        <Trash />
        {t("settings.archived.deletePermanently")}
      </Button>
    </article>
  );
};
