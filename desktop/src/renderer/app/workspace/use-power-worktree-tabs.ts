import type { Chat } from "@angel-engine/daemon-api/chat";
import type { WorkspaceNavigation } from "@/app/workspace/use-workspace-navigation";
import type { WorkspacePageModel } from "@/app/workspace/use-workspace-page-model";

import is from "@sindresorhus/is";
import { useCallback, useEffect, useMemo } from "react";
import { powerWorktreeShortcutAction } from "@/app/workspace/power-worktree-shortcuts";
import {
  openChatTab,
  setPowerActiveWorktree,
  setPowerDraftWorktree,
  setPowerWorktreeView,
  useChatTabStore,
} from "@/features/chat/state/chat-tab-store";
import {
  chatWorktreeCwd,
  chatWorktreeGroupKey,
} from "@/features/chat/worktree-grouping";

const EMPTY_CHATS: Chat[] = [];

export function usePowerWorktreeTabs(
  model: WorkspacePageModel,
  navigation: WorkspaceNavigation,
) {
  const {
    activePowerWorktree,
    chats,
    powerDraftContext,
    powerDraftTabActive,
    powerHomePageContext,
    powerModeActive,
    projects,
    selectedChat,
    selectedChatId,
  } = model;
  const { navigateToChat, navigateToDraft, startNewDraftSession } = navigation;
  const selectedChatProject =
    selectedChat && is.nonEmptyString(selectedChat.projectId)
      ? projects.find((project) => project.id === selectedChat.projectId)
      : undefined;
  const selectedChatWorktreeKey =
    powerModeActive && selectedChat
      ? chatWorktreeGroupKey(selectedChat, selectedChatProject?.path)
      : undefined;
  const selectedChatPowerWorktree =
    powerModeActive &&
    selectedChat !== undefined &&
    selectedChatProject !== undefined &&
    selectedChatWorktreeKey !== undefined
      ? {
          cwd: chatWorktreeCwd(selectedChat, selectedChatProject.path),
          groupKey: selectedChatWorktreeKey,
          projectId: selectedChatProject.id,
        }
      : undefined;
  const powerDraftWorktree =
    powerDraftTabActive && powerDraftContext !== undefined
      ? {
          cwd: powerDraftContext.cwd,
          groupKey: powerDraftContext.groupKey,
          projectId: powerDraftContext.projectId,
        }
      : undefined;
  const powerHomeTabContext =
    selectedChatPowerWorktree ??
    powerDraftWorktree ??
    (powerModeActive ? (activePowerWorktree ?? undefined) : undefined);
  const chatTabGroupKey = powerHomeTabContext?.groupKey;
  const chatTabGroups = useChatTabStore((state) => state.tabGroups);
  const closeChatTabInStore = useChatTabStore((state) => state.closeChatTab);
  const openSelectedPowerWorktreeHome = useCallback(() => {
    if (powerHomeTabContext === undefined) return;

    setPowerDraftWorktree(undefined);
    setPowerActiveWorktree(powerHomeTabContext);
    setPowerWorktreeView("home");
    navigateToDraft(powerHomeTabContext.projectId);
  }, [navigateToDraft, powerHomeTabContext]);
  const openPowerHistoryChatTab = useCallback(
    (chat: Chat) => {
      if (powerHomePageContext === undefined) return;

      setPowerActiveWorktree(powerHomePageContext);
      setPowerWorktreeView(null);
      openChatTab(powerHomePageContext.groupKey, chat.id);
      navigateToChat(chat);
    },
    [navigateToChat, powerHomePageContext],
  );

  const chatTabChats = useMemo(() => {
    if (chatTabGroupKey === undefined) return EMPTY_CHATS;

    const group = chatTabGroups[chatTabGroupKey];
    if (!group) return EMPTY_CHATS;

    const chatsById = new Map(chats.map((chat) => [chat.id, chat]));
    return group.chatIds
      .map((chatId) => chatsById.get(chatId))
      .filter((chat): chat is Chat => chat !== undefined && !chat.archived);
  }, [chats, chatTabGroups, chatTabGroupKey]);

  const closeChatTab = useCallback(
    (chat: Chat) => {
      if (chatTabGroupKey === undefined) return;

      const project = is.nonEmptyString(chat.projectId)
        ? projects.find((item) => item.id === chat.projectId)
        : undefined;
      const closedChatGroupKey = chatWorktreeGroupKey(chat, project?.path);
      const closedChatHomeContext =
        is.nonEmptyString(chat.projectId) && closedChatGroupKey !== undefined
          ? {
              cwd: chatWorktreeCwd(chat, project?.path),
              groupKey: closedChatGroupKey,
              projectId: chat.projectId,
            }
          : undefined;

      closeChatTabInStore(chatTabGroupKey, chat.id);
      if (chat.id !== selectedChatId) return;

      const homeContext = closedChatHomeContext ?? powerHomeTabContext;
      if (homeContext !== undefined) {
        setPowerDraftWorktree(undefined);
        setPowerActiveWorktree(homeContext);
        setPowerWorktreeView("home");
        navigateToDraft(homeContext.projectId);
      } else {
        navigateToDraft(chat.projectId ?? undefined);
      }
    },
    [
      chatTabGroupKey,
      closeChatTabInStore,
      navigateToDraft,
      powerHomeTabContext,
      projects,
      selectedChatId,
    ],
  );

  const openDraftTabFromTabBar = useCallback(() => {
    if (powerHomeTabContext !== undefined) {
      setPowerActiveWorktree(powerHomeTabContext);
      setPowerDraftWorktree(powerHomeTabContext);
      setPowerWorktreeView("draft");
      startNewDraftSession(powerHomeTabContext.projectId);
      return;
    }

    if (
      !selectedChat ||
      !selectedChatProject ||
      selectedChatWorktreeKey === undefined
    ) {
      return;
    }
    setPowerDraftWorktree({
      cwd: chatWorktreeCwd(selectedChat, selectedChatProject.path),
      groupKey: selectedChatWorktreeKey,
      projectId: selectedChatProject.id,
    });
    setPowerWorktreeView("draft");
    startNewDraftSession(selectedChatProject.id);
  }, [
    selectedChat,
    selectedChatProject,
    selectedChatWorktreeKey,
    powerHomeTabContext,
    startNewDraftSession,
  ]);

  const closeDraftTab = useCallback(() => {
    setPowerDraftWorktree(undefined);
    if (powerHomeTabContext !== undefined) {
      setPowerActiveWorktree(powerHomeTabContext);
      setPowerWorktreeView("home");
      navigateToDraft(powerHomeTabContext.projectId);
    }
  }, [navigateToDraft, powerHomeTabContext]);

  const openOrFocusDraftTab = useCallback(() => {
    if (!powerDraftTabActive) {
      openDraftTabFromTabBar();
    }
    window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>('[data-slot="input-group-control"]')
        ?.focus();
    });
  }, [openDraftTabFromTabBar, powerDraftTabActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      const action = powerWorktreeShortcutAction({
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        draftTabActive: powerDraftTabActive,
        hasActiveChat: selectedChat !== undefined,
        key: event.key,
        metaKey: event.metaKey,
        powerModeActive,
        repeat: event.repeat,
        shiftKey: event.shiftKey,
      });
      if (action === null) return;

      event.preventDefault();
      if (action === "close-draft") {
        closeDraftTab();
      } else if (action === "close-chat" && selectedChat !== undefined) {
        closeChatTab(selectedChat);
      } else if (action === "open-or-focus-draft") {
        openOrFocusDraftTab();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    closeChatTab,
    closeDraftTab,
    openOrFocusDraftTab,
    powerDraftTabActive,
    powerModeActive,
    selectedChat,
  ]);

  return {
    chatTabChats,
    closeChatTab,
    closeDraftTab,
    openDraftTabFromTabBar,
    openPowerHistoryChatTab,
    openSelectedPowerWorktreeHome,
    powerHomeTabContext,
  };
}

export type PowerWorktreeTabs = ReturnType<typeof usePowerWorktreeTabs>;
