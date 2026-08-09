import type { Chat } from "@angel-engine/daemon-api/chat";
import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType, FC } from "react";

import {
  Chats as ChatsIcon,
  GearSix as SettingsIcon,
  Plus as PlusIcon,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
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
import { displayChatTitle } from "@/app/workspace/workspace-display";
import { isCommandPaletteShortcut } from "@/features/command-palette/command-palette-shortcut";
import { createTitleSearch } from "@/features/command-palette/title-search";

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
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
    [chats, onNewWorkspace, onOpenSession, onOpenSettings, t],
  );
  const search = useMemo(() => createTitleSearch(entries), [entries]);
  const results = search(query, MAX_PALETTE_ITEMS);
  const actionResults = results.filter((entry) => entry.kind === "action");
  const sessionResults = results.filter((entry) => entry.kind === "session");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !isCommandPaletteShortcut(event, window.desktopEnvironment.platform)
      ) {
        return;
      }

      event.preventDefault();
      setOpen((current) => !current);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
