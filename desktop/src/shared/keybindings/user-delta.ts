import type { EffectiveBinding, KeybindingUserEntry } from "./types";

function whenEqual(a?: string, b?: string): boolean {
  return (a?.trim() ?? "") === (b?.trim() ?? "");
}

function normalizeEntries(
  entries: KeybindingUserEntry[],
): KeybindingUserEntry[] {
  const result: KeybindingUserEntry[] = [];
  for (const entry of entries) {
    if (entry.command.startsWith("-")) {
      result.push(entry);
      continue;
    }
    // Keep last positive for same (command, key, when)
    const existing = result.findIndex(
      (candidate) =>
        !candidate.command.startsWith("-") &&
        candidate.command === entry.command &&
        candidate.key === entry.key &&
        whenEqual(candidate.when, entry.when),
    );
    if (existing >= 0) {
      result.splice(existing, 1);
    }
    result.push(entry);
  }
  return result;
}

/** KIT-797 revision A: replace one effective binding with a new key. */
export function replaceEffectiveBinding(
  userEntries: readonly KeybindingUserEntry[],
  effective: EffectiveBinding,
  newKey: string,
): KeybindingUserEntry[] {
  if (newKey === effective.key && effective.origin.kind === "user-positive") {
    return [...userEntries];
  }

  let next = [...userEntries];

  // Step 1: invalidate old key
  if (effective.origin.kind === "user-positive") {
    const originIndex = effective.origin.index;
    if (originIndex >= 0) {
      next = next.filter((_, index) => index !== originIndex);
    } else {
      next = next.filter(
        (entry) =>
          entry.command.startsWith("-") ||
          !(
            entry.command === effective.command &&
            entry.key === effective.key &&
            whenEqual(entry.when, effective.when)
          ),
      );
    }
  } else if (newKey === effective.key) {
    // Recommended optimization: same key on default → only write positive.
  } else {
    next.push({
      key: effective.key,
      command: `-${effective.command}`,
      when: effective.when,
    });
  }

  // Step 2: write new key
  next.push({
    key: newKey,
    command: effective.command,
    when: effective.when,
  });

  return normalizeEntries(next);
}

/** KIT-797 revision A: append a binding for a command. */
export function appendUserBinding(
  userEntries: readonly KeybindingUserEntry[],
  command: string,
  newKey: string,
  when?: string,
  existingEffective: readonly EffectiveBinding[] = [],
): { entries: KeybindingUserEntry[]; alreadyExists: boolean } {
  const exists = existingEffective.some(
    (binding) =>
      binding.command === command &&
      binding.key === newKey &&
      whenEqual(binding.when, when),
  );
  if (exists) {
    return { entries: [...userEntries], alreadyExists: true };
  }

  let resolvedWhen = when;
  if (resolvedWhen === undefined && existingEffective.length > 0) {
    const first = existingEffective[0]?.when;
    if (existingEffective.every((b) => whenEqual(b.when, first))) {
      resolvedWhen = first;
    }
  }

  return {
    entries: normalizeEntries([
      ...userEntries,
      { key: newKey, command, when: resolvedWhen },
    ]),
    alreadyExists: false,
  };
}

/** KIT-797 revision A: remove one effective binding. */
export function removeEffectiveBinding(
  userEntries: readonly KeybindingUserEntry[],
  effective: EffectiveBinding,
): KeybindingUserEntry[] {
  if (effective.origin.kind === "user-positive") {
    const originIndex = effective.origin.index;
    if (originIndex >= 0) {
      return userEntries.filter((_, index) => index !== originIndex);
    }
    return userEntries.filter(
      (entry) =>
        entry.command.startsWith("-") ||
        !(
          entry.command === effective.command &&
          entry.key === effective.key &&
          whenEqual(entry.when, effective.when)
        ),
    );
  }

  return normalizeEntries([
    ...userEntries,
    {
      key: effective.key,
      command: `-${effective.command}`,
      when: effective.when,
    },
  ]);
}

/** Remove all user entries for a command (positive and unbind). */
export function resetCommandUserEntries(
  userEntries: readonly KeybindingUserEntry[],
  commandId: string,
): KeybindingUserEntry[] {
  return userEntries.filter((entry) => {
    const id = entry.command.startsWith("-")
      ? entry.command.slice(1)
      : entry.command;
    return id !== commandId;
  });
}

export function resetCategoryUserEntries(
  userEntries: readonly KeybindingUserEntry[],
  commandIds: readonly string[],
): KeybindingUserEntry[] {
  const set = new Set(commandIds);
  return userEntries.filter((entry) => {
    const id = entry.command.startsWith("-")
      ? entry.command.slice(1)
      : entry.command;
    return !set.has(id);
  });
}
