import type {
  CommandId,
  Conflict,
  KeybindingRule,
  KeymapPlatform,
} from "@shared/keybindings";
import { findConflicts } from "@shared/keybindings";

export function findCandidateConflicts({
  commandId,
  key,
  platform,
  rules,
  when,
}: {
  commandId: CommandId;
  key: string;
  platform: KeymapPlatform;
  rules: readonly KeybindingRule[];
  when?: string;
}): Conflict[] {
  const candidate: KeybindingRule = {
    command: commandId,
    key,
    source: "user",
    when,
  };

  return findConflicts([...rules, candidate], platform).filter(
    (conflict) =>
      (conflict.key === key || key.startsWith(`${conflict.key} `)) &&
      conflict.rules.some((rule) => rule.command === commandId) &&
      conflict.rules.some((rule) => rule.command !== commandId),
  );
}
