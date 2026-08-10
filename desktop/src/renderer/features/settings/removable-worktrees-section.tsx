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
import { confirmAction } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { broadcastChatsChanged } from "@/features/chat/chat-metadata-events";
import {
  deleteManagedWorktreesMutationOptions,
  managedWorktreeListQueryOptions,
} from "@/features/settings/api/managed-worktrees";
import {
  SettingsBulkBar,
  SettingsBulkCount,
  SettingsListNotice,
  SettingsListPlate,
  SettingsListRow,
} from "@/features/settings/archived-settings-list";
import {
  dangerActionClassName,
  sectionLabelClassName,
} from "@/features/settings/settings-controls";
import { splitWorktreePath } from "@/features/settings/removable-worktree-path";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

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
        const confirmed = await confirmAction({
          cancelLabel: t("common.cancel"),
          confirmLabel: t("common.delete"),
          description: t(
            "settings.archived.removableWorktrees.confirmDeleteDetail",
            {
              chatCount: targets.reduce(
                (total, worktree) => total + worktree.archivedChatCount,
                0,
              ),
              managedWorktreeCount: targets.filter(
                (worktree) => worktree.existsOnDisk,
              ).length,
            },
          ),
          title: t("settings.archived.removableWorktrees.confirmDeleteTitle"),
          tone: "danger",
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
      <div className="space-y-2">
        <h2
          className={cn(sectionLabelClassName, "px-0.5 text-muted-foreground")}
          id="removable-worktrees-title"
        >
          {t("settings.archived.removableWorktrees.title")}
        </h2>
        {/*
          Actions sit on their own row: the settings window can be as narrow as
          680px, and translated labels (fr/de) overflow a single title+actions
          line long before that. Wrapping keeps every action reachable.
        */}
        <div className="flex flex-wrap items-center justify-end gap-2">
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
        <SettingsBulkBar>
          <SettingsBulkCount>
            {t("settings.archived.selectedCount", {
              count: selectedWorktrees.length,
            })}
          </SettingsBulkCount>
          <Button
            className="rounded-full"
            disabled={
              deleteWorktreesMutation.isPending || worktrees.length === 0
            }
            onClick={toggleAll}
            size="xs"
            type="button"
            variant="ghost"
          >
            {allSelected ? <X /> : <Check />}
            {allSelected
              ? t("settings.archived.clearSelection")
              : t("settings.archived.selectAll")}
          </Button>
          <Button
            className={cn("rounded-full", dangerActionClassName)}
            disabled={
              deleteWorktreesMutation.isPending ||
              selectedWorktrees.length === 0
            }
            onClick={() => void deleteWorktrees(selectedWorktrees)}
            size="xs"
            type="button"
            variant="destructive"
          >
            <Trash />
            {t("settings.archived.deleteSelected")}
          </Button>
        </SettingsBulkBar>
      ) : null}

      <SettingsListPlate>
        {worktreesQuery.isPending ? (
          <SettingsListNotice>{t("common.loading")}</SettingsListNotice>
        ) : worktreesQuery.isError ? (
          <div className="flex items-start justify-between gap-4 px-3 py-6">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-medium text-status-danger">
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
          <SettingsListNotice>
            {t("settings.archived.removableWorktrees.empty")}
          </SettingsListNotice>
        ) : (
          <>
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
          </>
        )}
      </SettingsListPlate>
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
  const { directory, identifier } = splitWorktreePath(worktree.path);
  const worktreeLabel = `${projectName} · ${identifier}`;

  return (
    <SettingsListRow selected={bulkMode && selected}>
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
          <span
            className="min-w-0 truncate text-sm font-medium"
            title={worktreeLabel}
          >
            {worktreeLabel}
          </span>
          {!worktree.existsOnDisk ? (
            <span
              className="
                inline-flex shrink-0 items-center gap-1 rounded-full
                bg-status-attention-soft px-2 py-0.5 font-mono text-[0.625rem]
                tracking-wide text-status-attention uppercase
              "
            >
              <WarningCircle className="size-3" />
              {t("settings.archived.removableWorktrees.missingOnDisk")}
            </span>
          ) : null}
        </div>
        <div
          className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"
          title={worktree.path}
        >
          <span className="flex min-w-0 overflow-hidden font-mono text-[0.6875rem]">
            <span className="truncate">{directory}</span>
            <span className="shrink-0">{identifier}</span>
          </span>
          <span className="shrink-0">·</span>
          <span className="shrink-0 tabular-nums">
            {worktree.archivedChatCount === 0
              ? t("settings.archived.removableWorktrees.noSessions")
              : t("settings.archived.removableWorktrees.sessionCount", {
                  count: worktree.archivedChatCount,
                })}
          </span>
        </div>
      </div>
      {!bulkMode ? (
        <Button
          aria-label={t("settings.archived.removableWorktrees.deleteWorktree", {
            identifier,
            projectName,
          })}
          className={dangerActionClassName}
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
    </SettingsListRow>
  );
};
