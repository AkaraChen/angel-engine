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
  listEffectiveBindings,
  removeEffectiveBinding,
  replaceEffectiveBinding,
  resetCategoryUserEntries,
  resetCommandUserEntries,
} from "@shared/keybindings";
import {
  Keyboard as KeyboardIcon,
  Plus as PlusIcon,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { KeybindingHint } from "@/features/keybindings/components/keybinding-hint";
import { KeybindingRecorder } from "@/features/keybindings/keybinding-recorder";
import {
  SettingsGroup,
  SettingsRow,
} from "@/features/settings/settings-controls";
import { useSettingsStore } from "@/features/settings/settings-store";
import { useKeymap } from "@/platform/keymap/provider";
import { cn } from "@/platform/utils";

type FilterMode = "all" | "modified" | "conflicts";

export function KeyboardSettings() {
  const { t } = useTranslation();
  const {
    userEntries,
    saveUserBindings,
    resetAllUserBindings,
    keymap,
    platform,
    fatal,
    warnings,
    setRecording,
  } = useKeymap();
  const sendWithModEnter = useSettingsStore((state) => state.sendWithModEnter);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [recordingTarget, setRecordingTarget] = useState<
    | { mode: "replace"; binding: EffectiveBinding }
    | { mode: "append"; commandId: CommandId }
    | null
  >(null);

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

  const commands = useMemo(() => {
    return COMMAND_DESCRIPTORS.filter((descriptor) => descriptor.bindable);
  }, []);

  const rows = useMemo(() => {
    return commands
      .map((descriptor) => {
        const effective = listEffectiveBindings({
          defaultRules,
          userEntries,
          platform,
          commandId: descriptor.id,
        });
        return { descriptor, effective };
      })
      .filter(({ descriptor, effective }) => {
        if (filter === "modified" && !modifiedCommandIds.has(descriptor.id)) {
          return false;
        }
        if (filter === "conflicts" && !conflictCommandIds.has(descriptor.id)) {
          return false;
        }
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        const title = t(descriptor.titleKey).toLowerCase();
        const id = descriptor.id.toLowerCase();
        const keys = effective
          .map((binding) => {
            const formatted =
              formatBindingString(binding.key, platform)?.toLowerCase() ?? "";
            return `${binding.key} ${formatted}`;
          })
          .join(" ");
        return title.includes(q) || id.includes(q) || keys.includes(q);
      });
  }, [
    commands,
    defaultRules,
    userEntries,
    platform,
    filter,
    modifiedCommandIds,
    conflictCommandIds,
    query,
    t,
  ]);

  const grouped = useMemo(() => {
    const map = new Map<string, Array<(typeof rows)[number]>>();
    for (const row of rows) {
      const key = row.descriptor.categoryKey;
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows]);

  const persist = async (next: KeybindingUserEntry[]) => {
    await saveUserBindings({ version: 1, bindings: next });
  };

  const handleRecorded = async (canonicalKey: string) => {
    if (!recordingTarget) return;
    if (recordingTarget.mode === "replace") {
      const next = replaceEffectiveBinding(
        userEntries,
        recordingTarget.binding,
        canonicalKey,
      );
      await persist(next);
    } else {
      const effective = listEffectiveBindings({
        defaultRules,
        userEntries,
        platform,
        commandId: recordingTarget.commandId,
      });
      const result = appendUserBinding(
        userEntries,
        recordingTarget.commandId,
        canonicalKey,
        undefined,
        effective,
      );
      if (result.alreadyExists) {
        setRecordingTarget(null);
        setRecording(false);
        return;
      }
      await persist(result.entries);
    }
    setRecordingTarget(null);
    setRecording(false);
  };

  const sourceLabel = (commandId: string, effective: EffectiveBinding[]) => {
    if (conflictCommandIds.has(commandId)) {
      return t("settings.keyboard.sourceConflict");
    }
    if (modifiedCommandIds.has(commandId)) {
      return t("settings.keyboard.sourceUserOverride");
    }
    if (effective.some((binding) => binding.source === "user")) {
      return t("settings.keyboard.sourceUser");
    }
    return t("settings.keyboard.sourceDefault");
  };

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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings.keyboard.searchPlaceholder")}
          className="sm:flex-1"
        />
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", "settings.keyboard.filterAll"],
              ["modified", "settings.keyboard.filterModified"],
              ["conflicts", "settings.keyboard.filterConflicts"],
            ] as const
          ).map(([mode, labelKey]) => (
            <Button
              key={mode}
              size="sm"
              variant={filter === mode ? "default" : "outline"}
              onClick={() => setFilter(mode)}
            >
              {t(labelKey)}
            </Button>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void confirmAction({
              cancelLabel: t("common.cancel"),
              confirmLabel: t("settings.keyboard.resetAll"),
              title: t("settings.keyboard.resetAllConfirm"),
              tone: "danger",
            }).then((confirmed) => {
              if (!confirmed) return;
              // Main-process reset: backup + empty file (KIT-797 §6).
              void resetAllUserBindings();
            });
          }}
        >
          {t("settings.keyboard.resetAll")}
        </Button>
      </div>

      {grouped.map(([categoryKey, categoryRows]) => (
        <SettingsGroup key={categoryKey} title={t(categoryKey)}>
          {categoryRows.map(({ descriptor, effective }) => {
            const isRecording =
              recordingTarget?.mode === "append" &&
              recordingTarget.commandId === descriptor.id;

            return (
              <SettingsRow
                key={descriptor.id}
                title={t(descriptor.titleKey)}
                description={
                  <span className="flex flex-col gap-1">
                    <span className="font-mono text-[0.7rem] text-muted-foreground">
                      {descriptor.id}
                    </span>
                    <span
                      className={cn(
                        "text-[0.7rem]",
                        conflictCommandIds.has(descriptor.id)
                          ? "text-status-danger"
                          : "text-muted-foreground",
                      )}
                    >
                      {sourceLabel(descriptor.id, effective)}
                    </span>
                    {effective.map((binding) => {
                      const conflict = conflicts.find(
                        (item) =>
                          item.key === binding.key &&
                          item.rules.some(
                            (rule) => rule.command === binding.command,
                          ),
                      );
                      return (
                        <span
                          key={`${binding.key}-${binding.when ?? ""}`}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <button
                            type="button"
                            className="rounded-md border border-border-subtle px-1.5 py-0.5 hover:bg-muted"
                            onClick={() => {
                              setRecording(true);
                              setRecordingTarget({
                                mode: "replace",
                                binding,
                              });
                            }}
                          >
                            <KeybindingHint
                              binding={
                                formatBindingString(binding.key, platform) ??
                                binding.key
                              }
                              respectPreference={false}
                            />
                          </button>
                          {binding.when ? (
                            <span className="text-[0.65rem] text-muted-foreground">
                              when: {binding.when}
                            </span>
                          ) : null}
                          {conflict ? (
                            <span className="text-[0.65rem] text-status-danger">
                              {t(conflict.messageKey)}
                            </span>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              void persist(
                                removeEffectiveBinding(userEntries, binding),
                              );
                            }}
                          >
                            {t("settings.keyboard.remove")}
                          </Button>
                        </span>
                      );
                    })}
                    {recordingTarget?.mode === "replace" &&
                    recordingTarget.binding.command === descriptor.id ? (
                      <KeybindingRecorder
                        platform={platform}
                        onCancel={() => {
                          setRecordingTarget(null);
                          setRecording(false);
                        }}
                        onRecorded={(key) => void handleRecorded(key)}
                      />
                    ) : null}
                    {isRecording ? (
                      <KeybindingRecorder
                        platform={platform}
                        onCancel={() => {
                          setRecordingTarget(null);
                          setRecording(false);
                        }}
                        onRecorded={(key) => void handleRecorded(key)}
                      />
                    ) : null}
                  </span>
                }
                after={
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setRecording(true);
                        setRecordingTarget({
                          mode: "append",
                          commandId: descriptor.id,
                        });
                      }}
                    >
                      <PlusIcon className="size-3.5" />
                      {t("settings.keyboard.addShortcut")}
                    </Button>
                    {modifiedCommandIds.has(descriptor.id) ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() =>
                          void persist(
                            resetCommandUserEntries(userEntries, descriptor.id),
                          )
                        }
                      >
                        {t("settings.keyboard.resetCommand")}
                      </Button>
                    ) : null}
                  </div>
                }
              />
            );
          })}
          <div className="px-4 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              onClick={() => {
                const ids = categoryRows.map((row) => row.descriptor.id);
                void persist(resetCategoryUserEntries(userEntries, ids));
              }}
            >
              {t("settings.keyboard.resetCategory")}
            </Button>
          </div>
        </SettingsGroup>
      ))}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("settings.keyboard.emptySearch")}
        </p>
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
