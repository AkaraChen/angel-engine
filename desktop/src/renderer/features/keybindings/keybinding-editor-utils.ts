import type {
  CommandId,
  Conflict,
  EffectiveBinding,
  KeybindingRule,
  KeymapPlatform,
} from "@shared/keybindings";
import { findConflicts } from "@shared/keybindings";

export function findConflictForBinding(
  conflicts: readonly Conflict[],
  commandId: CommandId,
  binding: Pick<EffectiveBinding, "key" | "when">,
): Conflict | undefined {
  return conflicts.find((conflict) =>
    conflict.rules.some(
      (rule) =>
        rule.command === commandId &&
        rule.key === binding.key &&
        (rule.when ?? "") === (binding.when ?? ""),
    ),
  );
}

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
