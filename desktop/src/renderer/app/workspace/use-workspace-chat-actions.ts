import type { AgentRuntime } from "@angel-engine/daemon-api/agents";
import type {
  Chat,
  ChatHistoryMessage,
  ChatLoadResult,
  ChatRuntimeConfig,
} from "@angel-engine/daemon-api/chat";
import type { Project } from "@angel-engine/daemon-api/projects";
import type { PathLauncherTargetRef } from "@shared/path-launcher";
import type { WorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";
import type { ChatRunOrigin } from "@/app/workspace/workspace-thread-types";

import {
  isAgentRuntime,
  rememberAgentRuntimePreference,
} from "@angel-engine/daemon-api/agents";
import is from "@sindresorhus/is";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/app/workspace/workspace-display";
import {
  agentRuntimePreferenceFromExplicitOverrides,
  carryDraftAgentConfigToChat,
  clearDraftAgentConfig,
  draftAgentConfigFromExplicitOverrides,
} from "@/app/workspace/workspace-draft-agent-config";
import { currentHashRoutePath } from "@/app/workspace/workspace-route-paths";
import {
  archiveChatMutationOptions,
  chatContextMenuMutationOptions,
  deleteAllChatsMutationOptions,
  invalidateChatQueries,
  renameChatMutationOptions,
  setChatRuntimeMutationOptions,
} from "@/features/chat/api/queries";
import {
  broadcastAllChatsDeleted,
  broadcastChatsChanged,
  subscribeToChatMetadataEvents,
} from "@/features/chat/chat-metadata-events";
import {
  cancelAllChatRuns,
  cancelChatRun,
} from "@/features/chat/state/chat-run-store";
import {
  clearChatTabs,
  removeChatFromTabGroups,
} from "@/features/chat/state/chat-tab-store";
import {
  CHAT_ARCHIVE_UNDO_MS,
  createPendingChatArchiveQueue,
  isRestorePendingArchiveShortcut,
  restorePendingArchiveShortcutLabel,
  type PendingChatArchive,
  type PendingChatArchiveQueue,
} from "@/features/chat/state/pending-chat-archive";
import {
  createProjectMutationOptions,
  projectContextMenuMutationOptions,
} from "@/features/projects/api/queries";
import { queryKeys } from "@/platform/query-keys";

const EMPTY_CHATS: Chat[] = [];

interface UseWorkspaceChatActionsOptions {
  currentRoutePath: string;
  model: WorkspacePageModel;
  navigation: WorkspaceNavigation;
}

function upsertChatInList(chats: Chat[], chat: Chat) {
  const next = chats.filter((item) => item.id !== chat.id);
  next.unshift(chat);
  return next.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

function isNonEmptyAgentRuntime(
  runtime: AgentRuntime | undefined,
): runtime is AgentRuntime {
  return is.nonEmptyString(runtime);
}

export function useWorkspaceChatActions({
  currentRoutePath,
  model,
  navigation,
}: UseWorkspaceChatActionsOptions) {
  const {
    api,
    chats,
    isMacOS,
    modeOverride,
    modelOverride,
    navigate,
    permissionModeOverride,
    projects,
    queryClient,
    reasoningEffortOverride,
    routeDraftProjectId,
    routeProjectId,
    runtimePageKey,
    selectedChatId,
    setDraftAgentConfigs,
    t,
    toast,
    updateAgentSettings,
  } = model;
  const { navigateToChat, navigateToDraft } = navigation;
  const commitPendingArchiveRef = useRef<(pending: PendingChatArchive) => void>(
    () => {},
  );
  const pendingArchiveQueueRef = useRef<PendingChatArchiveQueue | null>(null);
  if (!pendingArchiveQueueRef.current) {
    pendingArchiveQueueRef.current = createPendingChatArchiveQueue({
      onCommit: (pending) => {
        commitPendingArchiveRef.current(pending);
      },
    });
  }
  const [renameChatId, setRenameChatId] = useState<string | null>(null);
  const [handoffChatId, setHandoffChatId] = useState<string | null>(null);
  const renameTargetChat = is.nonEmptyString(renameChatId)
    ? (chats.find((chat) => chat.id === renameChatId) ?? null)
    : null;
  const handoffTargetChat = is.nonEmptyString(handoffChatId)
    ? (chats.find((chat) => chat.id === handoffChatId) ?? null)
    : null;
  const [settingsProjectId, setSettingsProjectId] = useState<string | null>(
    null,
  );
  const settingsTargetProject = is.nonEmptyString(settingsProjectId)
    ? (projects.find((project) => project.id === settingsProjectId) ?? null)
    : null;

  const setChatInCache = useCallback(
    (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => {
      queryClient.setQueryData<Chat[]>(
        queryKeys.chats.list(),
        (current = []) =>
          pendingArchiveQueueRef.current?.isPending(chat.id)
            ? current.filter((item) => item.id !== chat.id)
            : upsertChatInList(current, chat),
      );
      queryClient.setQueryData<ChatLoadResult | undefined>(
        queryKeys.chats.detail(chat.id),
        (current) => {
          if (messages) {
            return { chat, config: config ?? current?.config, messages };
          }
          if (current) {
            return { ...current, chat, config: config ?? current.config };
          }
          return { chat, config, messages: [] };
        },
      );
    },
    [queryClient],
  );
  const setChatMessagesInCache = useCallback(
    (
      chatId: string,
      messages: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
    ) => {
      queryClient.setQueryData<ChatLoadResult | undefined>(
        queryKeys.chats.detail(chatId),
        (current) =>
          current
            ? { ...current, config: config ?? current.config, messages }
            : current,
      );
    },
    [queryClient],
  );

  const updateChatFromRun = useCallback(
    (
      chat: Chat,
      messages?: ChatHistoryMessage[],
      config?: ChatRuntimeConfig,
      origin?: ChatRunOrigin,
    ) => {
      const runRuntime =
        origin?.runtime ??
        (isAgentRuntime(chat.runtime) ? chat.runtime : undefined);
      const runConfig =
        origin?.config ??
        draftAgentConfigFromExplicitOverrides({
          mode: modeOverride,
          model: modelOverride,
          permissionMode: permissionModeOverride,
          reasoningEffort: reasoningEffortOverride,
        });

      if (origin?.isDraft === true && isNonEmptyAgentRuntime(runRuntime)) {
        setDraftAgentConfigs((current) =>
          carryDraftAgentConfigToChat(current, {
            config: runConfig,
            runtime: runRuntime,
            targetChatId: chat.id,
          }),
        );
      }
      if (messages !== undefined && isNonEmptyAgentRuntime(runRuntime)) {
        const preference = agentRuntimePreferenceFromExplicitOverrides(
          runConfig ?? {},
        );
        updateAgentSettings((current) =>
          rememberAgentRuntimePreference(current, runRuntime, preference),
        );
        if (origin?.isDraft) {
          setDraftAgentConfigs((current) =>
            clearDraftAgentConfig(current, origin.runtimePageKey, runRuntime),
          );
        }
      }

      setChatInCache(chat, messages, config);
      if (
        origin?.isDraft &&
        origin.runtimePageKey === runtimePageKey &&
        currentHashRoutePath() === currentRoutePath
      ) {
        navigateToChat(chat);
      }
    },
    [
      currentRoutePath,
      navigateToChat,
      modeOverride,
      modelOverride,
      setChatInCache,
      setDraftAgentConfigs,
      permissionModeOverride,
      reasoningEffortOverride,
      runtimePageKey,
      updateAgentSettings,
    ],
  );

  const createProjectMutation = useMutation({
    ...createProjectMutationOptions({ api, queryClient }),
  });
  const { mutateAsync: setChatRuntime } = useMutation({
    ...setChatRuntimeMutationOptions({ api, queryClient }),
  });
  const deleteAllChatsMutation = useMutation({
    ...deleteAllChatsMutationOptions({ api, queryClient }),
  });
  const archiveChatMutation = useMutation({
    ...archiveChatMutationOptions({ api, queryClient }),
  });
  const showProjectContextMenuMutation = useMutation({
    ...projectContextMenuMutationOptions({ api, queryClient }),
  });
  const showChatContextMenuMutation = useMutation({
    ...chatContextMenuMutationOptions({ api, queryClient }),
  });
  const renameChatMutation = useMutation({
    ...renameChatMutationOptions({ api, queryClient }),
  });

  const applyAllChatsDeleted = useCallback(() => {
    cancelAllChatRuns();
    clearChatTabs();
    queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), EMPTY_CHATS);
    queryClient.removeQueries({ queryKey: queryKeys.chats.details() });
    navigate("/", { replace: true });
  }, [navigate, queryClient]);

  useEffect(
    () =>
      subscribeToChatMetadataEvents((event) => {
        if (event.type === "delete-all") {
          applyAllChatsDeleted();
        } else {
          void invalidateChatQueries(queryClient).then(() => {
            const queue = pendingArchiveQueueRef.current;
            if (!queue?.hasPending()) return;
            queryClient.setQueryData<Chat[]>(
              queryKeys.chats.list(),
              (current = []) =>
                current.filter((chat) => !queue.isPending(chat.id)),
            );
          });
        }
      }),
    [applyAllChatsDeleted, queryClient],
  );

  const createProjectFromPicker = useCallback(async () => {
    try {
      const selectedPath = await api.projects.chooseDirectory();
      if (!is.nonEmptyString(selectedPath)) return undefined;
      return await createProjectMutation.mutateAsync(selectedPath);
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("notifications.couldNotAddProject"),
        variant: "destructive",
      });
      return undefined;
    }
  }, [api, createProjectMutation, t, toast]);

  const showProjectContextMenu = useCallback(
    async (project: Project) => {
      try {
        const action =
          await showProjectContextMenuMutation.mutateAsync(project);
        if (action === "settings") {
          setSettingsProjectId(project.id);
        } else if (
          action === "deleted" &&
          (routeProjectId ?? routeDraftProjectId) === project.id
        ) {
          navigate("/", { replace: true });
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.projectActionFailed"),
          variant: "destructive",
        });
      }
    },
    [
      navigate,
      routeDraftProjectId,
      routeProjectId,
      showProjectContextMenuMutation,
      t,
      toast,
    ],
  );
  const showPathLauncherContextMenu = useCallback(
    async (
      ref: PathLauncherTargetRef,
      options: { includeAngelTerminal?: boolean } = {},
    ) => {
      try {
        return await api.pathLauncher.showContextMenu({
          includeAngelTerminal: options.includeAngelTerminal,
          target: ref,
        });
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.projectActionFailed"),
          variant: "destructive",
        });
        return undefined;
      }
    },
    [api, t, toast],
  );

  const removeChatFromCache = useCallback(
    (chatId: string) => {
      cancelChatRun(chatId);
      removeChatFromTabGroups(chatId);
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        current.filter((chat) => chat.id !== chatId),
      );
      queryClient.removeQueries({ queryKey: queryKeys.chats.detail(chatId) });
      if (selectedChatId === chatId) navigate("/", { replace: true });
    },
    [navigate, queryClient, selectedChatId],
  );
  const openRenameChatDialog = useCallback((chat: Chat) => {
    setRenameChatId(chat.id);
  }, []);
  const openSessionHandoffDialog = useCallback((chat: Chat) => {
    setHandoffChatId(chat.id);
  }, []);
  const showChatContextMenu = useCallback(
    async (chat: Chat) => {
      try {
        const action = await showChatContextMenuMutation.mutateAsync(chat);
        if (action === "rename") {
          openRenameChatDialog(chat);
        } else if (action === "handoff") {
          openSessionHandoffDialog(chat);
        } else if (action === "deleted") {
          removeChatFromCache(chat.id);
        }
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.chatActionFailed"),
          variant: "destructive",
        });
      }
    },
    [
      openRenameChatDialog,
      openSessionHandoffDialog,
      removeChatFromCache,
      showChatContextMenuMutation,
      t,
      toast,
    ],
  );
  const closeRenameChatDialog = useCallback(() => setRenameChatId(null), []);
  const closeSessionHandoffDialog = useCallback(
    () => setHandoffChatId(null),
    [],
  );
  const closeProjectSettingsDialog = useCallback(
    () => setSettingsProjectId(null),
    [],
  );
  const renameChat = useCallback(
    async (chat: Chat, title: string) => {
      try {
        await renameChatMutation.mutateAsync({ chatId: chat.id, title });
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.couldNotRenameChat"),
          variant: "destructive",
        });
        throw error;
      }
    },
    [renameChatMutation, t, toast],
  );
  const setPersistedChatRuntime = useCallback(
    async (chatId: string, runtime: AgentRuntime) => {
      try {
        const chat = await setChatRuntime({ chatId, runtime });
        cancelChatRun(chat.id);
      } catch (error) {
        toast({
          description: getErrorMessage(error),
          title: t("notifications.couldNotChangeAgent"),
          variant: "destructive",
        });
      }
    },
    [setChatRuntime, t, toast],
  );

  const restorePendingArchive = useCallback(
    (restored: { chat: Chat; wasSelected: boolean } | null) => {
      if (!restored) return false;
      setChatInCache(restored.chat);
      if (restored.wasSelected) {
        navigateToChat(restored.chat);
      }
      return true;
    },
    [navigateToChat, setChatInCache],
  );

  useEffect(() => {
    commitPendingArchiveRef.current = (pending) => {
      void (async () => {
        try {
          await archiveChatMutation.mutateAsync(pending.chat);
          removeChatFromTabGroups(pending.chat.id);
          broadcastChatsChanged();
        } catch (error) {
          restorePendingArchive(pending);
          toast({
            description: getErrorMessage(error),
            title: t("notifications.chatActionFailed"),
            variant: "destructive",
          });
        }
      })();
    };
  }, [archiveChatMutation, restorePendingArchive, t, toast]);

  const archiveChat = useCallback(
    async (chat: Chat) => {
      const queue = pendingArchiveQueueRef.current;
      if (!queue) return;

      await queryClient.cancelQueries({
        exact: true,
        queryKey: queryKeys.chats.list(),
      });
      const wasSelected = selectedChatId === chat.id;
      queryClient.setQueryData<Chat[]>(queryKeys.chats.list(), (current = []) =>
        current.filter((item) => item.id !== chat.id),
      );
      if (wasSelected) {
        navigateToDraft(chat.projectId ?? undefined, { replace: true });
      }

      const dismissToast = toast({
        action: {
          label: t("notifications.undo"),
          onClick: () => {
            restorePendingArchive(queue.undo(chat.id));
          },
        },
        description: t("notifications.chatArchivedDescription", {
          shortcut: restorePendingArchiveShortcutLabel(isMacOS),
        }),
        duration: CHAT_ARCHIVE_UNDO_MS,
        title: t("notifications.chatArchived"),
      });

      queue.schedule(chat, wasSelected, { dismissToast });
    },
    [
      isMacOS,
      navigateToDraft,
      queryClient,
      restorePendingArchive,
      selectedChatId,
      t,
      toast,
    ],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        !isRestorePendingArchiveShortcut(event, isMacOS)
      ) {
        return;
      }
      const queue = pendingArchiveQueueRef.current;
      if (!queue?.hasPending()) return;
      event.preventDefault();
      restorePendingArchive(queue.undoLatest());
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMacOS, restorePendingArchive]);
  const deleteAllChats = useCallback(async () => {
    try {
      const result = await deleteAllChatsMutation.mutateAsync();
      applyAllChatsDeleted();
      broadcastAllChatsDeleted();
      toast({
        description: t("notifications.chatsDeletedDescription", {
          count: result.deletedCount,
        }),
        title: t("notifications.chatsDeleted"),
      });
    } catch (error) {
      toast({
        description: getErrorMessage(error),
        title: t("notifications.couldNotDeleteChats"),
        variant: "destructive",
      });
    }
  }, [applyAllChatsDeleted, deleteAllChatsMutation, t, toast]);

  return {
    archiveChat,
    closeProjectSettingsDialog,
    closeRenameChatDialog,
    closeSessionHandoffDialog,
    createProjectFromPicker,
    deleteAllChats,
    deleteAllChatsPending: deleteAllChatsMutation.isPending,
    handoffTargetChat,
    renameChat,
    renameChatPending: renameChatMutation.isPending,
    renameTargetChat,
    setChatMessagesInCache,
    setPersistedChatRuntime,
    settingsTargetProject,
    showChatContextMenu,
    showPathLauncherContextMenu,
    showProjectContextMenu,
    updateChatFromRun,
  };
}

export type WorkspaceChatActions = ReturnType<typeof useWorkspaceChatActions>;
