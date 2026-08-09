import type {
  CommandId,
  ContextKeyValues,
  KeybindingUserEntry,
  KeybindingsFile,
  LoadFatal,
  LoadWarning,
} from "@shared/keybindings";
import {
  createDefaultKeybindingRules,
  detectKeymapPlatform,
  formatBindingString,
  mergeKeybindingLayers,
} from "@shared/keybindings";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useSettingsStore } from "@/features/settings/settings-store";
import { ipc } from "@/platform/ipc";
import {
  dispatchKeyEvent,
  loadKeymap,
  type KeymapDispatchState,
  type LoadedKeymap,
} from "./keymap-engine";
import { commandRegistry, type CommandHandler } from "./registry";

type ContextKeyOwner = symbol;

interface KeymapContextValue {
  keymap: LoadedKeymap;
  userEntries: KeybindingUserEntry[];
  warnings: LoadWarning[];
  fatal?: LoadFatal;
  platform: ReturnType<typeof detectKeymapPlatform>;
  contextKeys: ContextKeyValues;
  publishContextKey: (
    key: string,
    value: string | boolean | undefined,
    owner: ContextKeyOwner,
  ) => void;
  clearContextKeyIfOwner: (key: string, owner: ContextKeyOwner) => void;
  setRecording: (recording: boolean) => void;
  refreshUserBindings: () => Promise<void>;
  saveUserBindings: (file: KeybindingsFile) => Promise<void>;
  resetAllUserBindings: () => Promise<void>;
  getBindingLabel: (commandId: CommandId) => string | undefined;
  registerCommand: (id: CommandId, handler: CommandHandler) => () => void;
}

const KeymapContext = createContext<KeymapContextValue | null>(null);

function readPlatform() {
  try {
    return detectKeymapPlatform(window.desktopEnvironment?.platform ?? "linux");
  } catch {
    return detectKeymapPlatform("linux");
  }
}

export function KeymapProvider({ children }: { children: ReactNode }) {
  const platform = useMemo(() => readPlatform(), []);
  const sendWithModEnter = useSettingsStore((state) => state.sendWithModEnter);
  const [userEntries, setUserEntries] = useState<KeybindingUserEntry[]>([]);
  const [warnings, setWarnings] = useState<LoadWarning[]>([]);
  const [fatal, setFatal] = useState<LoadFatal | undefined>();
  const [contextKeys, setContextKeysState] = useState<ContextKeyValues>({
    platform: platform === "mac" ? "mac" : platform === "win" ? "win" : "linux",
  });
  const contextRef = useRef(contextKeys);
  contextRef.current = contextKeys;
  /**
   * Per-key stack of {owner, value}. Publish pushes/updates; clear pops and
   * restores the previous entry so nested owners unmount correctly.
   */
  const contextStacksRef = useRef(
    new Map<
      string,
      Array<{ owner: ContextKeyOwner; value: string | boolean | undefined }>
    >(),
  );

  const dispatchState = useRef<KeymapDispatchState>({
    chordPending: null,
    recording: false,
  });

  const defaultRules = useMemo(
    () => createDefaultKeybindingRules({ sendWithModEnter }),
    [sendWithModEnter],
  );

  const keymap = useMemo(() => {
    const merged = mergeKeybindingLayers({
      defaultRules,
      userEntries,
      platform,
    });
    return loadKeymap({
      rules: merged.rules,
      warnings: [...warnings, ...merged.warnings],
      platform,
    });
  }, [defaultRules, userEntries, platform, warnings]);

  const refreshUserBindings = useCallback(async () => {
    try {
      const state = await ipc.keymapGetUserBindings();
      setUserEntries(state.file.bindings);
      setWarnings(state.warnings);
      setFatal(state.fatal);
    } catch {
      setUserEntries([]);
      setWarnings([]);
      setFatal(undefined);
    }
  }, []);

  const saveUserBindings = useCallback(async (file: KeybindingsFile) => {
    const state = await ipc.keymapSetUserBindings(file);
    setUserEntries(state.file.bindings);
    setWarnings(state.warnings);
    setFatal(state.fatal);
  }, []);

  const resetAllUserBindings = useCallback(async () => {
    const state = await ipc.keymapResetAll();
    setUserEntries(state.file.bindings);
    setWarnings(state.warnings);
    setFatal(state.fatal);
  }, []);

  useEffect(() => {
    void refreshUserBindings();
  }, [refreshUserBindings]);

  useEffect(() => {
    return window.desktopWindow.onKeymapUserBindingsChanged((state) => {
      const file = state.file as KeybindingsFile;
      setUserEntries(file.bindings ?? []);
      setWarnings((state.warnings as LoadWarning[]) ?? []);
      setFatal(state.fatal as LoadFatal | undefined);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Synchronous dispatch so preventDefault runs in the same turn.
      dispatchKeyEvent({
        event,
        keymap,
        context: contextRef.current,
        state: dispatchState.current,
        onChordTimeout: () => {
          dispatchState.current.chordPending = null;
        },
      });
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keymap]);

  const publishContextKey = useCallback(
    (
      key: string,
      value: string | boolean | undefined,
      owner: ContextKeyOwner,
    ) => {
      const stack = contextStacksRef.current.get(key) ?? [];
      const existing = stack.findIndex((entry) => entry.owner === owner);
      if (existing >= 0) {
        stack[existing] = { owner, value };
      } else {
        stack.push({ owner, value });
      }
      contextStacksRef.current.set(key, stack);
      const top = stack[stack.length - 1]!;
      setContextKeysState((current) => {
        if (current[key] === top.value) return current;
        return { ...current, [key]: top.value };
      });
    },
    [],
  );

  const clearContextKeyIfOwner = useCallback(
    (key: string, owner: ContextKeyOwner) => {
      const stack = contextStacksRef.current.get(key);
      if (!stack) return;
      const index = stack.findIndex((entry) => entry.owner === owner);
      if (index < 0) return;
      stack.splice(index, 1);
      if (stack.length === 0) {
        contextStacksRef.current.delete(key);
        setContextKeysState((current) => {
          if (!(key in current)) return current;
          const next = { ...current };
          delete next[key];
          return next;
        });
        return;
      }
      contextStacksRef.current.set(key, stack);
      const top = stack[stack.length - 1]!;
      setContextKeysState((current) => {
        if (current[key] === top.value) return current;
        return { ...current, [key]: top.value };
      });
    },
    [],
  );

  const setRecording = useCallback((recording: boolean) => {
    dispatchState.current.recording = recording;
    if (recording) dispatchState.current.chordPending = null;
  }, []);

  const getBindingLabel = useCallback(
    (commandId: CommandId) => {
      const keys = keymap.lookup(commandId);
      if (keys.length === 0) return undefined;
      return formatBindingString(keys[0]!, platform);
    },
    [keymap, platform],
  );

  const registerCommand = useCallback(
    (id: CommandId, handler: CommandHandler) =>
      commandRegistry.register(id, handler),
    [],
  );

  const value = useMemo<KeymapContextValue>(
    () => ({
      keymap,
      userEntries,
      warnings,
      fatal,
      platform,
      contextKeys,
      publishContextKey,
      clearContextKeyIfOwner,
      setRecording,
      refreshUserBindings,
      saveUserBindings,
      resetAllUserBindings,
      getBindingLabel,
      registerCommand,
    }),
    [
      keymap,
      userEntries,
      warnings,
      fatal,
      platform,
      contextKeys,
      publishContextKey,
      clearContextKeyIfOwner,
      setRecording,
      refreshUserBindings,
      saveUserBindings,
      resetAllUserBindings,
      getBindingLabel,
      registerCommand,
    ],
  );

  return (
    <KeymapContext.Provider value={value}>{children}</KeymapContext.Provider>
  );
}

export function useKeymap() {
  const value = useContext(KeymapContext);
  if (!value) {
    throw new Error("useKeymap must be used within KeymapProvider");
  }
  return value;
}

export function useCommand(
  id: CommandId,
  handler: CommandHandler,
  deps: unknown[],
) {
  const { registerCommand } = useKeymap();
  useEffect(() => {
    return registerCommand(id, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, registerCommand, ...deps]);
}

/**
 * Publish a context key while mounted. Cleanup only clears the key when this
 * hook instance is still the registered owner (token), so concurrent publishers
 * of the same key do not wipe each other on unmount.
 */
export function useContextKey(
  key: string,
  value: string | boolean | undefined,
) {
  const { publishContextKey, clearContextKeyIfOwner } = useKeymap();
  const ownerRef = useRef<ContextKeyOwner | null>(null);
  if (ownerRef.current === null) {
    ownerRef.current = Symbol(`context:${key}`);
  }

  useEffect(() => {
    const owner = ownerRef.current!;
    publishContextKey(key, value, owner);
    return () => {
      clearContextKeyIfOwner(key, owner);
    };
  }, [key, value, publishContextKey, clearContextKeyIfOwner]);
}

export function useKeybindingLabel(id: CommandId): string | undefined {
  const { getBindingLabel } = useKeymap();
  return getBindingLabel(id);
}

export function KeymapScope({
  scope,
  id,
  capture,
  children,
}: {
  scope: string;
  id?: string;
  capture?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className="contents"
      data-keymap-scope={scope}
      data-keymap-scope-id={id}
      data-keymap-capture={capture ? id : undefined}
    >
      {children}
    </div>
  );
}
