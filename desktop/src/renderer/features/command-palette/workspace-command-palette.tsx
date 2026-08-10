import type { Chat } from "@angel-engine/daemon-api/chat";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType, FC } from "react";

import { DaemonRequestError } from "@angel-engine/daemon-client";
import {
  Binoculars as BinocularsIcon,
  Chats as ChatsIcon,
  GearSix as SettingsIcon,
  Plus as PlusIcon,
} from "@phosphor-icons/react";
import is from "@sindresorhus/is";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useToast } from "@/components/ui/toast";
import { COMMAND_IDS } from "@shared/keybindings";
import { displayChatTitle } from "@/app/workspace/workspace-display";
import {
  useWorkspaceToolStore,
  workspaceToolPullRequestTabId,
} from "@/app/workspace/workspace-tool-store";
import { useWorkspaceUiStore } from "@/app/workspace/workspace-ui-store";
import { createTitleSearch } from "@/features/command-palette/title-search";
import {
  isShepherdActive,
  startShepherdMutationOptions,
  stopShepherdMutationOptions,
} from "@/features/shepherd/api/queries";
import { parseGitHubPullRequestUrl } from "@/features/shepherd/parse-github-pr-url";
import { useApi } from "@/platform/use-api";
import { useCommand, useContextKey } from "@/platform/keymap/provider";
import { queryKeys } from "@/platform/query-keys";

const MAX_PALETTE_ITEMS = 20;

interface CommandPaletteEntry {
  icon: ComponentType<Pick<IconProps, "className" | "weight">>;
  id: string;
  kind: "action" | "session";
  onSelect: () => void;
  title: string;
}

interface WorkspaceCommandPaletteProps {
  chats: Chat[];
  onNewWorkspace: () => void;
  onOpenSession: (chat: Chat) => void;
  onOpenSettings: () => void;
}

export const WorkspaceCommandPalette: FC<WorkspaceCommandPaletteProps> = ({
  chats,
  onNewWorkspace,
  onOpenSession,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const setRightSidebarOpen = useWorkspaceUiStore(
    (state) => state.setRightSidebarOpen,
  );
  const toolContext = useWorkspaceToolStore((state) => state.context);
  const updateWorkspaceToolSnapshot = useWorkspaceToolStore(
    (state) => state.updateWorkspaceToolSnapshot,
  );
  const startMutation = useMutation(
    startShepherdMutationOptions({ api, queryClient }),
  );
  const stopMutation = useMutation(
    stopShepherdMutationOptions({ api, queryClient }),
  );
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const shepherdPr = async () => {
    const chatId = toolContext.chatId;
    const root = toolContext.root;
    const contextKey = toolContext.contextKey;
    setRightSidebarOpen(true);
    if (is.nonEmptyString(contextKey)) {
      updateWorkspaceToolSnapshot(contextKey, (snapshot) => ({
        ...snapshot,
        activeTabId: workspaceToolPullRequestTabId,
      }));
    }

    if (!is.nonEmptyString(chatId) || !is.nonEmptyString(root)) {
      toast({
        title: t("workspace.tools.pullRequest.shepherd.noChat"),
        variant: "destructive",
      });
      return;
    }

    try {
      const existing = await api.shepherd.get(chatId);
      if (isShepherdActive(existing.session) && existing.session !== null) {
        await stopMutation.mutateAsync(existing.session.id);
        toast({
          title: t("workspace.tools.pullRequest.shepherd.stopped"),
          variant: "default",
        });
        return;
      }

      const status = await api.github.pullRequestStatus({ cwd: root });
      if (status.state !== "OPEN") {
        toast({
          title: t("workspace.tools.pullRequest.noOpen"),
          description: t("workspace.tools.pullRequest.noOpenDetail"),
          variant: "destructive",
        });
        return;
      }
      const parsed = parseGitHubPullRequestUrl(status.url);
      if (parsed === null) {
        toast({
          title: t("workspace.tools.pullRequest.shepherd.startFailed"),
          description: t("workspace.tools.pullRequest.shepherd.invalidUrl"),
          variant: "destructive",
        });
        return;
      }
      await startMutation.mutateAsync({
        chatId,
        owner: parsed.owner,
        prNumber: parsed.prNumber,
        repo: parsed.repo,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.github.pullRequest(root),
      });
      toast({
        title: t("workspace.tools.pullRequest.shepherd.started"),
        variant: "success",
      });
    } catch (error) {
      const code =
        error instanceof DaemonRequestError
          ? (error.code ?? "unknown")
          : "unknown";
      if (code === "github-cli-unauthenticated") {
        toast({
          description: t(
            "workspace.tools.pullRequest.errors.unauthenticatedDetail",
          ),
          title: t("workspace.tools.pullRequest.errors.unauthenticated"),
          variant: "destructive",
        });
        return;
      }
      toast({
        description: error instanceof Error ? error.message : String(error),
        title: t("workspace.tools.pullRequest.shepherd.actionFailed"),
        variant: "destructive",
      });
    }
  };

  const entries = useMemo<CommandPaletteEntry[]>(
    () => [
      {
        icon: PlusIcon,
        id: "new-workspace",
        kind: "action",
        onSelect: onNewWorkspace,
        title: t("ui.commandNewWorkspace"),
      },
      {
        icon: BinocularsIcon,
        id: "shepherd-pr",
        kind: "action",
        onSelect: () => {
          void shepherdPr();
        },
        title: t("ui.commandShepherdPr"),
      },
      {
        icon: SettingsIcon,
        id: "open-settings",
        kind: "action",
        onSelect: onOpenSettings,
        title: t("sidebar.settings"),
      },
      ...chats
        .filter((chat) => !chat.archived)
        .map((chat) => ({
          icon: ChatsIcon,
          id: `session:${chat.id}`,
          kind: "session" as const,
          onSelect: () => onOpenSession(chat),
          title: displayChatTitle(chat.title, t),
        })),
    ],
    // shepherdPr closes over latest api/context; title strings depend on t only.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional palette entry snapshot
    [chats, onNewWorkspace, onOpenSession, onOpenSettings, t],
  );
  const search = useMemo(() => createTitleSearch(entries), [entries]);
  const results = search(query, MAX_PALETTE_ITEMS);
  const actionResults = results.filter((entry) => entry.kind === "action");
  const sessionResults = results.filter((entry) => entry.kind === "session");

  useContextKey("palette.open", open);
  useCommand(COMMAND_IDS.paletteOpen, () => {
    setOpen((current) => !current);
    return true;
  }, []);
  useCommand(COMMAND_IDS.paletteClose, () => {
    if (!open) return false;
    setOpen(false);
    setQuery("");
    return true;
  }, [open]);

  const selectEntry = (entry: CommandPaletteEntry) => {
    setOpen(false);
    setQuery("");
    entry.onSelect();
  };

  return (
    <CommandDialog
      description={t("ui.commandDescription")}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
      open={open}
      title={t("ui.commandPalette")}
    >
      <Command shouldFilter={false}>
        <CommandInput
          autoFocus
          onValueChange={setQuery}
          placeholder={t("ui.commandDescription")}
          value={query}
        />
        <CommandList>
          <CommandEmpty>{t("ui.commandNoResults")}</CommandEmpty>
          {actionResults.length > 0 ? (
            <CommandGroup heading={t("ui.commandActions")}>
              {actionResults.map((entry) => (
                <PaletteEntry
                  entry={entry}
                  key={entry.id}
                  onSelect={selectEntry}
                />
              ))}
            </CommandGroup>
          ) : null}
          {sessionResults.length > 0 ? (
            <CommandGroup heading={t("ui.commandSessions")}>
              {sessionResults.map((entry) => (
                <PaletteEntry
                  entry={entry}
                  key={entry.id}
                  onSelect={selectEntry}
                />
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
};

const PaletteEntry: FC<{
  entry: CommandPaletteEntry;
  onSelect: (entry: CommandPaletteEntry) => void;
}> = ({ entry, onSelect }) => {
  const Icon = entry.icon;

  return (
    <CommandItem onSelect={() => onSelect(entry)} value={entry.id}>
      <Icon className="text-muted-foreground" weight="duotone" />
      <span className="truncate">{entry.title}</span>
    </CommandItem>
  );
};
