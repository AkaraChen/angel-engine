import type {
  ManagedWorktreeSummary,
  Project,
} from "@angel-engine/daemon-api/projects";
import type { FC } from "react";
import {
  ArrowClockwise,
  Check,
  GitBranch,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const worktreesQuery = useQuery({
    ...managedWorktreeListQueryOptions({ api }),
  });
  const deleteWorktreesMutation = useMutation({
    ...deleteManagedWorktreesMutationOptions({ api, queryClient }),
  });
  const worktrees = worktreesQuery.data ?? EMPTY_WORKTREES;
  const selectedWorktrees = useMemo(
    () => worktrees.filter((worktree) => selectedPaths.has(worktree.path)),
    [selectedPaths, worktrees],
  );
  const allSelected =
    worktrees.length > 0 && selectedWorktrees.length === worktrees.length;

  const deleteWorktrees = useCallback(
    async (targets: ManagedWorktreeSummary[]) => {
      if (targets.length === 0) return;

      try {
        const confirmed =
          await window.desktopWindow.confirmDeleteManagedWorktrees({
            chatCount: targets.reduce(
              (total, worktree) => total + worktree.archivedChatCount,
              0,
            ),
            managedWorktreeCount: targets.filter(
              (worktree) => worktree.existsOnDisk,
            ).length,
          });
        if (!confirmed) return;

        const result = await deleteWorktreesMutation.mutateAsync({
          targets: targets.map((worktree) => ({
            expectedChatIds: worktree.chatIds,
            expectedExistsOnDisk: worktree.existsOnDisk,
            path: worktree.path,
          })),
        });
        broadcastChatsChanged();
        setSelectedPaths(new Set());
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
          variant:
            result.failedWorktrees.length > 0 ? "destructive" : undefined,
        });
      } catch (error) {
        await worktreesQuery.refetch();
        toast({
          description: error instanceof Error ? error.message : String(error),
          title: t("settings.archived.removableWorktrees.deleteFailed"),
          variant: "destructive",
        });
      }
    },
    [deleteWorktreesMutation, t, toast, worktreesQuery],
  );

  const toggleBulkMode = useCallback(() => {
    setBulkMode((current) => !current);
    setSelectedPaths(new Set());
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedPaths(
      allSelected
        ? new Set()
        : new Set(worktrees.map((worktree) => worktree.path)),
    );
  }, [allSelected, worktrees]);

  const toggleSelected = useCallback((path: string, selected: boolean) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(path);
      } else {
        next.delete(path);
      }
      return next;
    });
  }, []);

  const busy = worktreesQuery.isFetching || deleteWorktreesMutation.isPending;

  return (
    <section aria-labelledby="removable-worktrees-title" className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <h2
          className="min-w-0 truncate text-sm font-medium"
          id="removable-worktrees-title"
        >
          {t("settings.archived.removableWorktrees.title")}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          {bulkMode ? (
            <Button
              disabled={
                deleteWorktreesMutation.isPending ||
                selectedWorktrees.length === 0
              }
              onClick={() => void deleteWorktrees(selectedWorktrees)}
              size="sm"
              type="button"
              variant="destructive"
            >
              <Trash />
              {t("settings.archived.deleteSelected")}
            </Button>
          ) : null}
          <Button
            disabled={worktrees.length === 0 && !bulkMode}
            onClick={toggleBulkMode}
            size="sm"
            type="button"
            variant={bulkMode ? "outline" : "secondary"}
          >
            {bulkMode ? <X /> : <Check />}
            {bulkMode
              ? t("settings.archived.done")
              : t("settings.archived.bulkSelect")}
          </Button>
          <Button
            disabled={busy}
            onClick={() => void worktreesQuery.refetch()}
            size="sm"
            type="button"
            variant="outline"
          >
            <ArrowClockwise />
            {t("settings.archived.removableWorktrees.scanAgain")}
          </Button>
        </div>
      </div>

      {bulkMode ? (
        <div
          className="
            flex items-center justify-between gap-3 text-xs
            text-muted-foreground
          "
        >
          <div>
            {t("settings.archived.selectedCount", {
              count: selectedWorktrees.length,
            })}
          </div>
          <Button
            className="h-7 px-2 text-xs"
            disabled={
              deleteWorktreesMutation.isPending || worktrees.length === 0
            }
            onClick={toggleAll}
            size="sm"
            type="button"
            variant="ghost"
          >
            {allSelected ? <X /> : <Check />}
            {allSelected
              ? t("settings.archived.clearSelection")
              : t("settings.archived.selectAll")}
          </Button>
        </div>
      ) : null}

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
                bulkMode={bulkMode}
                disabled={deleteWorktreesMutation.isPending}
                key={worktree.path}
                onDelete={() => void deleteWorktrees([worktree])}
                onSelectedChange={(selected) =>
                  toggleSelected(worktree.path, selected)
                }
                project={
                  worktree.projectId === null
                    ? undefined
                    : projectsById.get(worktree.projectId)
                }
                selected={selectedPaths.has(worktree.path)}
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
  bulkMode: boolean;
  disabled: boolean;
  onDelete: () => void;
  onSelectedChange: (selected: boolean) => void;
  project?: Project;
  selected: boolean;
  worktree: ManagedWorktreeSummary;
};

const RemovableWorktreeRow: FC<RemovableWorktreeRowProps> = ({
  bulkMode,
  disabled,
  onDelete,
  onSelectedChange,
  project,
  selected,
  worktree,
}) => {
  const { t } = useTranslation();
  const projectName = project
    ? getProjectDisplayName(project.path)
    : worktree.projectSlug;

  return (
    <article className="flex min-w-0 items-start gap-3 px-4 py-3">
      {bulkMode ? (
        <Checkbox
          aria-label={worktree.path}
          checked={selected}
          className="mt-0.5"
          disabled={disabled}
          onCheckedChange={(checked) => onSelectedChange(checked === true)}
        />
      ) : (
        <GitBranch className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
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
          className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          title={worktree.path}
        >
          <span className="min-w-0 truncate">{worktree.path}</span>
          <span className="shrink-0">·</span>
          <span className="shrink-0">
            {t("settings.archived.removableWorktrees.sessionCount", {
              count: worktree.archivedChatCount,
            })}
          </span>
        </div>
      </div>
      {!bulkMode ? (
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
      ) : null}
    </article>
  );
};
