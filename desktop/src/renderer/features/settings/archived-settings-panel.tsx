import type { Chat } from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { TimeFilter } from "./archived-settings-filters";
import {
  Check,
  ArrowClockwise as Restore,
  Trash as Trash2,
  X,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { NativeSelectOption } from "@/components/ui/native-select";
import { useToast } from "@/components/ui/toast";
import {
  archivedChatListQueryOptions,
  deleteArchivedChatsMutationOptions,
  restoreArchivedChatsMutationOptions,
} from "@/features/chat/api/queries";
import {
  broadcastChatsChanged,
  subscribeToChatMetadataEvents,
} from "@/features/chat/chat-metadata-events";
import { projectListQueryOptions } from "@/features/projects/api/queries";
import {
  dangerActionClassName,
  sectionLabelClassName,
} from "@/features/settings/settings-controls";
import { queryKeys } from "@/platform/query-keys";
import { useApi } from "@/platform/use-api";
import { cn } from "@/platform/utils";

import {
  chatMatchesProjectFilter,
  chatMatchesTimeFilter,
  NO_PROJECT_FILTER,
  timeFilterOptions,
} from "./archived-settings-filters";
import {
  ArchivedChatRow,
  ArchivedFilterSelect,
  SettingsBulkBar,
  SettingsBulkCount,
  SettingsListNotice,
  SettingsListPlate,
} from "./archived-settings-list";
import { invalidateManagedWorktreeQueries } from "./api/managed-worktrees";
import { RemovableWorktreesSection } from "./removable-worktrees-section";

const EMPTY_CHATS: Chat[] = [];
const EMPTY_PROJECTS: Project[] = [];
export function ArchivedSettingsPanel() {
  const api = useApi();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const archivedChatsQuery = useQuery({
    ...archivedChatListQueryOptions({ api }),
  });
  const projectsQuery = useQuery({
    ...projectListQueryOptions({ api }),
  });
  const restoreArchivedChatsMutation = useMutation({
    ...restoreArchivedChatsMutationOptions({ api, queryClient }),
  });
  const deleteArchivedChatsMutation = useMutation({
    ...deleteArchivedChatsMutationOptions({ api, queryClient }),
  });
  const archivedChats = archivedChatsQuery.data ?? EMPTY_CHATS;
  const projects = projectsQuery.data ?? EMPTY_PROJECTS;
  const projectsById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const filtersActive = timeFilter !== "all" || projectFilter !== "all";
  const filteredChats = useMemo(
    () =>
      archivedChats.filter(
        (chat) =>
          chatMatchesTimeFilter(chat, timeFilter) &&
          chatMatchesProjectFilter(chat, projectFilter),
      ),
    [archivedChats, projectFilter, timeFilter],
  );
  const clearFilters = useCallback(() => {
    setTimeFilter("all");
    setProjectFilter("all");
  }, []);
  const selectedChats = useMemo(
    () => filteredChats.filter((chat) => selectedIds.has(chat.id)),
    [filteredChats, selectedIds],
  );
  const allVisibleSelected =
    filteredChats.length > 0 && selectedChats.length === filteredChats.length;
  const busy =
    restoreArchivedChatsMutation.isPending ||
    deleteArchivedChatsMutation.isPending;

  useEffect(
    () =>
      subscribeToChatMetadataEvents(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.chats.archived(),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.worktrees.all(),
        });
      }),
    [queryClient],
  );

  const restoreChats = useCallback(
    async (chats: Chat[]) => {
      if (chats.length === 0) return;

      try {
        await restoreArchivedChatsMutation.mutateAsync({
          chatIds: chats.map((chat) => chat.id),
        });
        await invalidateManagedWorktreeQueries(queryClient);
        broadcastChatsChanged();
        setSelectedIds(new Set());
        toast({
          title: t("settings.archived.restoredToast", {
            count: chats.length,
          }),
        });
      } catch (error) {
        toast({
          description: error instanceof Error ? error.message : String(error),
          title: t("notifications.chatActionFailed"),
          variant: "destructive",
        });
      }
    },
    [queryClient, restoreArchivedChatsMutation, t, toast],
  );

  const deleteChats = useCallback(
    async (chats: Chat[]) => {
      if (chats.length === 0) return;

      try {
        const chatIds = chats.map((chat) => chat.id);
        const impact = await api.chats.archivedDeleteImpact({ chatIds });
        const confirmed = await confirmAction({
          cancelLabel: t("common.cancel"),
          confirmLabel: t("common.delete"),
          description:
            impact.managedWorktreeCount > 0
              ? t("settings.archived.confirmDeleteWorktreeDetail", {
                  chatCount: impact.chatCount,
                  managedWorktreeCount: impact.managedWorktreeCount,
                })
              : t("settings.archived.confirmDeleteDetail", {
                  chatCount: impact.chatCount,
                }),
          title: t("settings.archived.confirmDeleteTitle"),
          tone: "danger",
        });
        if (!confirmed) return;

        const result = await deleteArchivedChatsMutation.mutateAsync({
          chatIds,
        });
        await invalidateManagedWorktreeQueries(queryClient);
        broadcastChatsChanged();
        setSelectedIds(new Set());
        toast({
          title: t("settings.archived.deletedToast", {
            count: result.deletedCount,
          }),
        });
      } catch (error) {
        toast({
          description: error instanceof Error ? error.message : String(error),
          title: t("notifications.chatActionFailed"),
          variant: "destructive",
        });
      }
    },
    [api, deleteArchivedChatsMutation, queryClient, t, toast],
  );

  const toggleBulkMode = useCallback(() => {
    setBulkMode((current) => !current);
    setSelectedIds(new Set());
  }, []);

  const toggleAllVisible = useCallback(() => {
    setSelectedIds(
      allVisibleSelected
        ? new Set()
        : new Set(filteredChats.map((chat) => chat.id)),
    );
  }, [allVisibleSelected, filteredChats]);

  const toggleSelected = useCallback((chatId: string, selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(chatId);
      } else {
        next.delete(chatId);
      }
      return next;
    });
  }, []);

  return (
    <div className="space-y-6">
      <RemovableWorktreesSection projectsById={projectsById} />

      <section aria-labelledby="archived-sessions-title" className="space-y-3">
        <h2
          className={cn(sectionLabelClassName, "px-0.5 text-muted-foreground")}
          id="archived-sessions-title"
        >
          {t("settings.archived.sessionsTitle")}
        </h2>

        <div className="flex flex-wrap items-end gap-3">
          <ArchivedFilterSelect
            label={t("settings.archived.filterTime")}
            onValueChange={(value) => setTimeFilter(value as TimeFilter)}
            value={timeFilter}
          >
            {timeFilterOptions.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {t(option.labelKey)}
              </NativeSelectOption>
            ))}
          </ArchivedFilterSelect>
          <ArchivedFilterSelect
            label={t("settings.archived.filterProject")}
            onValueChange={setProjectFilter}
            value={projectFilter}
          >
            <NativeSelectOption value="all">
              {t("settings.archived.allProjects")}
            </NativeSelectOption>
            <NativeSelectOption value={NO_PROJECT_FILTER}>
              {t("settings.archived.noProject")}
            </NativeSelectOption>
            {projects.map((project) => (
              <NativeSelectOption key={project.id} value={project.id}>
                {getProjectDisplayName(project.path)}
              </NativeSelectOption>
            ))}
          </ArchivedFilterSelect>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {archivedChats.length > 0 ? (
              <span className="text-xs text-muted-foreground" role="status">
                {t("settings.archived.resultCount", {
                  count: filteredChats.length,
                  defaultValue: "{{count}} matching",
                })}
              </span>
            ) : null}
            {filtersActive ? (
              <Button
                onClick={clearFilters}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t("settings.archived.clearFilters", {
                  defaultValue: "Clear filters",
                })}
              </Button>
            ) : null}
            <Button
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
          </div>
        </div>

        {bulkMode ? (
          <SettingsBulkBar>
            <SettingsBulkCount>
              {t("settings.archived.selectedCount", {
                count: selectedChats.length,
              })}
            </SettingsBulkCount>
            <Button
              className="rounded-full"
              disabled={busy || filteredChats.length === 0}
              onClick={toggleAllVisible}
              size="xs"
              type="button"
              variant="ghost"
            >
              {allVisibleSelected ? <X /> : <Check />}
              {allVisibleSelected
                ? t("settings.archived.clearSelection")
                : t("settings.archived.selectAll")}
            </Button>
            <Button
              className="rounded-full"
              disabled={busy || selectedChats.length === 0}
              onClick={() => void restoreChats(selectedChats)}
              size="xs"
              type="button"
              variant="outline"
            >
              <Restore />
              {t("settings.archived.restoreSelected")}
            </Button>
            <Button
              className={cn("rounded-full", dangerActionClassName)}
              disabled={busy || selectedChats.length === 0}
              onClick={() => void deleteChats(selectedChats)}
              size="xs"
              type="button"
              variant="destructive"
            >
              <Trash2 />
              {t("settings.archived.deleteSelected")}
            </Button>
          </SettingsBulkBar>
        ) : null}

        <SettingsListPlate>
          {archivedChatsQuery.isPending ? (
            <SettingsListNotice>{t("common.loading")}</SettingsListNotice>
          ) : archivedChatsQuery.isError ? (
            <div className="flex items-start justify-between gap-4 px-3 py-6">
              <div className="min-w-0 space-y-1">
                <div className="text-sm font-medium text-status-danger">
                  {t("common.failed")}
                </div>
                <div className="text-xs wrap-break-word text-muted-foreground">
                  {archivedChatsQuery.error instanceof Error
                    ? archivedChatsQuery.error.message
                    : String(archivedChatsQuery.error)}
                </div>
              </div>
              <Button
                onClick={() => void archivedChatsQuery.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                {t("common.reload")}
              </Button>
            </div>
          ) : archivedChats.length === 0 ? (
            <SettingsListNotice>
              {t("settings.archived.empty")}
            </SettingsListNotice>
          ) : filteredChats.length === 0 ? (
            <SettingsListNotice>
              {t("settings.archived.noMatches", {
                defaultValue: "No archived sessions match these filters.",
              })}
            </SettingsListNotice>
          ) : (
            <>
              {filteredChats.map((chat) => (
                <ArchivedChatRow
                  bulkMode={bulkMode}
                  chat={chat}
                  disabled={busy}
                  key={chat.id}
                  project={
                    is.nonEmptyString(chat.projectId)
                      ? projectsById.get(chat.projectId)
                      : undefined
                  }
                  selected={selectedIds.has(chat.id)}
                  onDelete={() => void deleteChats([chat])}
                  onRestore={() => void restoreChats([chat])}
                  onSelectedChange={(selected) =>
                    toggleSelected(chat.id, selected)
                  }
                />
              ))}
            </>
          )}
        </SettingsListPlate>
      </section>
    </div>
  );
}
