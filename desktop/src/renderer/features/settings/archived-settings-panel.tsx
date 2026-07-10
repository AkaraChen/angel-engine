import type { Chat } from "@shared/chat";
import type { Project } from "@shared/projects";
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
import { queryKeys } from "@/platform/query-keys";
import { useApi } from "@/platform/use-api";

import {
  chatMatchesProjectFilter,
  chatMatchesTimeFilter,
  NO_PROJECT_FILTER,
  timeFilterOptions,
} from "./archived-settings-filters";
import {
  ArchivedChatRow,
  ArchivedFilterSelect,
} from "./archived-settings-list";

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
  const filteredChats = useMemo(
    () =>
      archivedChats.filter(
        (chat) =>
          chatMatchesTimeFilter(chat, timeFilter) &&
          chatMatchesProjectFilter(chat, projectFilter),
      ),
    [archivedChats, projectFilter, timeFilter],
  );
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
    [restoreArchivedChatsMutation, t, toast],
  );

  const deleteChats = useCallback(
    async (chats: Chat[]) => {
      if (chats.length === 0) return;

      try {
        const chatIds = chats.map((chat) => chat.id);
        const impact = await api.chats.archivedDeleteImpact({ chatIds });
        const confirmed = await window.desktopWindow.confirmDeleteArchivedChats(
          {
            chatCount: impact.chatCount,
            managedWorktreeCount: impact.managedWorktreeCount,
          },
        );
        if (!confirmed) return;

        const result = await deleteArchivedChatsMutation.mutateAsync({
          chatIds,
        });
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
    [api, deleteArchivedChatsMutation, t, toast],
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
    <div className="space-y-4">
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
        <div className="ml-auto flex items-center gap-2">
          {bulkMode ? (
            <>
              <Button
                disabled={busy || selectedChats.length === 0}
                onClick={() => void restoreChats(selectedChats)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Restore />
                {t("settings.archived.restoreSelected")}
              </Button>
              <Button
                disabled={busy || selectedChats.length === 0}
                onClick={() => void deleteChats(selectedChats)}
                size="sm"
                type="button"
                variant="destructive"
              >
                <Trash2 />
                {t("settings.archived.deleteSelected")}
              </Button>
            </>
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
        <div
          className="
            flex items-center justify-between gap-3 text-xs
            text-muted-foreground
          "
        >
          <div>
            {t("settings.archived.selectedCount", {
              count: selectedChats.length,
            })}
          </div>
          <Button
            className="h-7 px-2 text-xs"
            disabled={busy || filteredChats.length === 0}
            onClick={toggleAllVisible}
            size="sm"
            type="button"
            variant="ghost"
          >
            {allVisibleSelected ? <X /> : <Check />}
            {allVisibleSelected
              ? t("settings.archived.clearSelection")
              : t("settings.archived.selectAll")}
          </Button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border bg-card">
        {archivedChatsQuery.isPending ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t("common.loading")}
          </div>
        ) : archivedChatsQuery.isError ? (
          <div className="flex items-start justify-between gap-4 px-4 py-6">
            <div className="min-w-0 space-y-1">
              <div className="text-sm font-medium text-destructive">
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
        ) : filteredChats.length === 0 ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t("settings.archived.empty")}
          </div>
        ) : (
          <div className="divide-y divide-border">
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
          </div>
        )}
      </div>
    </div>
  );
}
