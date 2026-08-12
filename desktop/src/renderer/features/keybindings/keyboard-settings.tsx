import type {
  CommandId,
  EffectiveBinding,
  KeybindingUserEntry,
} from "@shared/keybindings";
import {
  COMMAND_DESCRIPTORS,
  appendUserBinding,
  createDefaultKeybindingRules,
  formatBindingString,
  getCommandDescriptor,
  listEffectiveBindings,
  removeEffectiveBinding,
  replaceEffectiveBinding,
  resetCategoryUserEntries,
  resetCommandUserEntries,
} from "@shared/keybindings";
import { Keyboard as KeyboardIcon, X as XIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { KeybindingHint } from "@/features/keybindings/components/keybinding-hint";
import { KeybindingMenu } from "@/features/keybindings/components/keybinding-menu";
import { KeybindingRecorder } from "@/features/keybindings/keybinding-recorder";
import { findConflictForBinding } from "@/features/keybindings/keybinding-editor-utils";
import { useKeybindingCommandJump } from "@/features/keybindings/use-keybinding-command-jump";
import {
  SettingsGroup,
  SettingsRow,
} from "@/features/settings/settings-controls";
import { useSettingsStore } from "@/features/settings/settings-store";
import { useKeymap } from "@/platform/keymap/provider";
import { cn } from "@/platform/utils";

type FilterMode = "all" | "conflicts" | "modified" | "unbound";
type RecordingTarget =
  | {
      binding: EffectiveBinding;
      commandId: CommandId;
      mode: "replace";
      returnFocus: HTMLElement | null;
    }
  | {
      commandId: CommandId;
      mode: "append";
      returnFocus: HTMLElement | null;
    };

export function KeyboardSettings() {
  const { t } = useTranslation();
  const {
    fatal,
    keymap,
    platform,
    resetAllUserBindings,
    saveUserBindings,
    setRecording,
    userEntries,
    warnings,
  } = useKeymap();
  const sendWithModEnter = useSettingsStore((state) => state.sendWithModEnter);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [query, setQuery] = useState("");
  const [recordingTarget, setRecordingTarget] =
    useState<RecordingTarget | null>(null);

  const defaultRules = useMemo(
    () => createDefaultKeybindingRules({ sendWithModEnter }),
    [sendWithModEnter],
  );
  const conflicts = keymap.findConflicts();
  const conflictCommandIds = useSet(
    conflicts.flatMap((conflict) => conflict.rules.map((rule) => rule.command)),
  );
  const modifiedCommandIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of userEntries) {
      ids.add(
        entry.command.startsWith("-") ? entry.command.slice(1) : entry.command,
      );
    }
    return ids;
  }, [userEntries]);
  const commands = useMemo(
    () => COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.bindable),
    [],
  );

  const allRows = useMemo(
    () =>
      commands.map((descriptor) => ({
        descriptor,
        effective: listEffectiveBindings({
          commandId: descriptor.id,
          defaultRules,
          platform,
          userEntries,
        }),
      })),
    [commands, defaultRules, platform, userEntries],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const rows = useMemo(
    () =>
      allRows.filter(({ descriptor, effective }) => {
        if (filter === "modified" && !modifiedCommandIds.has(descriptor.id))
          return false;
        if (filter === "conflicts" && !conflictCommandIds.has(descriptor.id))
          return false;
        if (filter === "unbound" && effective.length > 0) return false;
        if (!normalizedQuery) return true;
        const keys = effective
          .map(
            (binding) =>
              `${binding.key} ${formatBindingString(binding.key, platform) ?? ""}`,
          )
          .join(" ")
          .toLowerCase();
        return (
          t(descriptor.titleKey).toLowerCase().includes(normalizedQuery) ||
          descriptor.id.toLowerCase().includes(normalizedQuery) ||
          keys.includes(normalizedQuery)
        );
      }),
    [
      allRows,
      conflictCommandIds,
      filter,
      modifiedCommandIds,
      normalizedQuery,
      platform,
      t,
    ],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, Array<(typeof rows)[number]>>();
    for (const row of rows) {
      const list = map.get(row.descriptor.categoryKey) ?? [];
      list.push(row);
      map.set(row.descriptor.categoryKey, list);
    }
    return [...map.entries()];
  }, [rows]);

  const persist = async (next: KeybindingUserEntry[]) => {
    await saveUserBindings({ bindings: next, version: 1 });
  };
  const restoreFocus = (target: RecordingTarget | null) => {
    window.setTimeout(() => {
      if (!target) return;
      const fallback = document
        .getElementById(`keybinding-${target.commandId}`)
        ?.querySelector<HTMLButtonElement>("button");
      const trigger = target.returnFocus?.isConnected
        ? target.returnFocus
        : fallback;
      if (trigger) trigger.dataset.suppressMenuFocusOpen = "true";
      trigger?.focus();
    }, 50);
  };
  const finishRecording = (
    target: RecordingTarget | null,
    { restore = true }: { restore?: boolean } = {},
  ) => {
    setRecordingTarget(null);
    setRecording(false);
    if (restore) restoreFocus(target);
  };
  const startRecording = (
    target:
      | { binding: EffectiveBinding; commandId: CommandId; mode: "replace" }
      | { commandId: CommandId; mode: "append" },
    trigger: HTMLElement,
  ) => {
    setRecording(true);
    setRecordingTarget({ ...target, returnFocus: trigger } as RecordingTarget);
  };
  const handleRecorded = async (canonicalKey: string) => {
    const target = recordingTarget;
    if (!target) return;
    if (target.mode === "replace") {
      await persist(
        replaceEffectiveBinding(userEntries, target.binding, canonicalKey),
      );
    } else {
      const effective = listEffectiveBindings({
        commandId: target.commandId,
        defaultRules,
        platform,
        userEntries,
      });
      const result = appendUserBinding(
        userEntries,
        target.commandId,
        canonicalKey,
        undefined,
        effective,
      );
      if (!result.alreadyExists) await persist(result.entries);
    }
    finishRecording(target);
  };
  const jumpToCommand = useKeybindingCommandJump({
    filter,
    query,
    setFilter,
    setQuery,
  });

  return (
    <div className="space-y-6">
      {fatal ? (
        <div className="rounded-xl border border-status-danger-border bg-card px-4 py-3 text-sm">
          <p className="font-medium text-status-danger">
            {t("settings.keyboard.loadFailedTitle")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t("settings.keyboard.loadFailedDescription")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void ipcOpenEditor()}
            >
              {t("settings.keyboard.openConfig")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void ipcResetAll(persist)}
            >
              {t("settings.keyboard.resetBroken")}
            </Button>
          </div>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("settings.keyboard.warningsCount", { count: warnings.length })}
        </p>
      ) : null}

      <div className="sticky top-0 z-20 -mx-2 rounded-xl border border-border-subtle bg-background/95 p-2 shadow-xs backdrop-blur-xl">
        <div className="space-y-2">
          <div className="relative min-w-48 flex-1">
            <Input
              aria-label={t("settings.keyboard.searchPlaceholder")}
              className="pr-9"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("settings.keyboard.searchPlaceholder")}
              value={query}
            />
            {query ? (
              <button
                aria-label={t("settings.keyboard.clearSearch")}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-overlay-hover hover:text-foreground focus-visible:ring-3 focus-visible:ring-primary/25 focus-visible:outline-hidden"
                onClick={() => setQuery("")}
                type="button"
              >
                <XIcon className="size-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "settings.keyboard.filterAll"],
                  ["modified", "settings.keyboard.filterModified"],
                  ["conflicts", "settings.keyboard.filterConflicts"],
                  ["unbound", "settings.keyboard.filterUnbound"],
                ] as const
              ).map(([mode, labelKey]) => (
                <Button
                  key={mode}
                  onClick={() => setFilter(mode)}
                  size="sm"
                  variant={filter === mode ? "default" : "ghost"}
                >
                  {t(labelKey)}
                </Button>
              ))}
            </div>
            <Button
              onClick={() => {
                void confirmAction({
                  cancelLabel: t("common.cancel"),
                  confirmLabel: t("settings.keyboard.resetAll"),
                  title: t("settings.keyboard.resetAllConfirm"),
                  tone: "danger",
                }).then((confirmed) => {
                  if (confirmed) void resetAllUserBindings();
                });
              }}
              size="sm"
              variant="outline"
            >
              {t("settings.keyboard.resetAll")}
            </Button>
          </div>
        </div>
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          {t("settings.keyboard.resultSummary", {
            count: rows.length,
            modified: modifiedCommandIds.size,
          })}
        </p>
      </div>

      {grouped.map(([categoryKey, categoryRows]) => (
        <SettingsGroup
          after={
            <Button
              className="h-7 text-xs"
              onClick={() => {
                const ids = categoryRows.map((row) => row.descriptor.id);
                void persist(resetCategoryUserEntries(userEntries, ids));
              }}
              size="sm"
              variant="ghost"
            >
              {t("settings.keyboard.resetCategory")}
            </Button>
          }
          key={categoryKey}
          title={`${t(categoryKey)} · ${categoryRows.length}`}
        >
          {categoryRows.map(({ descriptor, effective }) => {
            const modified = modifiedCommandIds.has(descriptor.id);
            const idMatched =
              Boolean(normalizedQuery) &&
              descriptor.id.toLowerCase().includes(normalizedQuery);
            const activeRecorder =
              recordingTarget?.commandId === descriptor.id
                ? recordingTarget
                : null;

            return (
              <div
                className="group/row scroll-mt-28"
                id={`keybinding-${descriptor.id}`}
                key={descriptor.id}
              >
                <SettingsRow
                  after={
                    <div className="flex max-w-[55vw] flex-wrap items-center justify-end gap-2">
                      {(effective.length > 0 ? effective : [null]).map(
                        (binding, index) => {
                          const conflict = binding
                            ? findConflictForBinding(
                                conflicts,
                                descriptor.id,
                                binding,
                              )
                            : undefined;
                          const otherRule = conflict?.rules.find(
                            (rule) => rule.command !== descriptor.id,
                          );
                          const otherDescriptor = otherRule
                            ? getCommandDescriptor(otherRule.command)
                            : undefined;
                          const formatted = binding
                            ? (formatBindingString(binding.key, platform) ??
                              binding.key)
                            : t("settings.keyboard.unbound");
                          const state = conflict
                            ? "conflict"
                            : modified
                              ? "modified"
                              : "default";

                          return (
                            <KeybindingMenu
                              ariaLabel={t(
                                "settings.keyboard.modifyShortcutLabel",
                                {
                                  command: t(descriptor.titleKey),
                                  shortcut: formatted,
                                },
                              )}
                              canRemove={Boolean(binding)}
                              conflictTitle={
                                otherDescriptor
                                  ? t(otherDescriptor.titleKey)
                                  : undefined
                              }
                              key={
                                binding
                                  ? `${binding.key}-${binding.when ?? ""}`
                                  : `unbound-${index}`
                              }
                              modified={modified}
                              onJumpToConflict={
                                otherRule
                                  ? () => jumpToCommand(otherRule.command)
                                  : undefined
                              }
                              onModify={(trigger) => {
                                if (binding) {
                                  startRecording(
                                    {
                                      binding,
                                      commandId: descriptor.id,
                                      mode: "replace",
                                    },
                                    trigger,
                                  );
                                } else {
                                  startRecording(
                                    {
                                      commandId: descriptor.id,
                                      mode: "append",
                                    },
                                    trigger,
                                  );
                                }
                              }}
                              onRemove={() => {
                                if (binding)
                                  void persist(
                                    removeEffectiveBinding(
                                      userEntries,
                                      binding,
                                    ),
                                  );
                              }}
                              onReset={() =>
                                void persist(
                                  resetCommandUserEntries(
                                    userEntries,
                                    descriptor.id,
                                  ),
                                )
                              }
                            >
                              <span className="inline-flex min-h-8 items-center rounded-lg px-1.5">
                                {binding ? (
                                  <KeybindingHint
                                    binding={formatted}
                                    respectPreference={false}
                                    state={state}
                                  />
                                ) : (
                                  <Kbd className="border-dashed bg-transparent text-muted-foreground shadow-none">
                                    {t("settings.keyboard.unbound")}
                                  </Kbd>
                                )}
                              </span>
                            </KeybindingMenu>
                          );
                        },
                      )}
                    </div>
                  }
                  title={t(descriptor.titleKey)}
                  description={
                    <span
                      className={cn(
                        "font-mono text-[0.6875rem] transition-opacity",
                        idMatched
                          ? "rounded-sm bg-primary-soft px-1 text-primary-soft-foreground opacity-100"
                          : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
                      )}
                    >
                      {descriptor.id}
                    </span>
                  }
                />
                {activeRecorder ? (
                  <KeybindingRecorder
                    commandId={descriptor.id}
                    onCancel={() => finishRecording(activeRecorder)}
                    onJumpToConflict={(commandId) => {
                      finishRecording(activeRecorder, { restore: false });
                      jumpToCommand(commandId);
                    }}
                    onRecorded={(key) => void handleRecorded(key)}
                    platform={platform}
                    rules={keymap.rules}
                    when={
                      activeRecorder.mode === "replace"
                        ? activeRecorder.binding.when
                        : undefined
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </SettingsGroup>
      ))}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {t("settings.keyboard.emptySearch")}
          </p>
          {query ? (
            <Button
              className="mt-3"
              onClick={() => setQuery("")}
              size="sm"
              variant="outline"
            >
              {t("settings.keyboard.clearSearch")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <KeyboardIcon className="size-3.5" />
        {t("settings.keyboard.hintsLink")}
      </p>
    </div>
  );
}

function useSet(values: string[]) {
  return useMemo(() => new Set(values), [values]);
}

async function ipcOpenEditor() {
  const { ipc } = await import("@/platform/ipc");
  await ipc.keymapOpenInEditor();
}

async function ipcResetAll(
  persist: (entries: KeybindingUserEntry[]) => Promise<void>,
) {
  const { ipc } = await import("@/platform/ipc");
  await ipc.keymapResetAll();
  await persist([]);
}
