import type { CommandId } from "@shared/keybindings";
import { useEffect, useState } from "react";

type FilterMode = "all" | "conflicts" | "modified" | "unbound";

export function useKeybindingCommandJump({
  filter,
  query,
  setFilter,
  setQuery,
}: {
  filter: FilterMode;
  query: string;
  setFilter: (filter: FilterMode) => void;
  setQuery: (query: string) => void;
}) {
  const [pendingCommandId, setPendingCommandId] = useState<CommandId | null>(
    null,
  );

  useEffect(() => {
    if (!pendingCommandId) return;
    const target = document.getElementById(`keybinding-${pendingCommandId}`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() =>
      target.querySelector<HTMLButtonElement>("button")?.focus(),
    );
    setPendingCommandId(null);
  }, [filter, pendingCommandId, query]);

  return (commandId: CommandId) => {
    setQuery("");
    setFilter("all");
    setPendingCommandId(commandId);
  };
}
