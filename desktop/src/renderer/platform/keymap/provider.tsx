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

interface KeymapContextValue {
  keymap: LoadedKeymap;
  userEntries: KeybindingUserEntry[];
  warnings: LoadWarning[];
  fatal?: LoadFatal;
  platform: ReturnType<typeof detectKeymapPlatform>;
  contextKeys: ContextKeyValues;
  setContextKeys: (patch: ContextKeyValues) => void;
  setRecording: (recording: boolean) => void;
  refreshUserBindings: () => Promise<void>;
  saveUserBindings: (file: KeybindingsFile) => Promise<void>;
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

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function findCaptureZoneId(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest("[data-keymap-capture]");
  return el?.getAttribute("data-keymap-capture") ?? null;
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
      void dispatchKeyEvent({
        event,
        keymap,
        context: contextRef.current,
        captureZoneId: findCaptureZoneId(event.target),
        focusEditable: isEditableElement(event.target),
        state: dispatchState.current,
        onChordTimeout: () => {
          dispatchState.current.chordPending = null;
        },
      });
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keymap]);

  const setContextKeys = useCallback((patch: ContextKeyValues) => {
    setContextKeysState((current) => {
      let changed = false;
      const next = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (current[key] !== value) {
          next[key] = value;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

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
      setContextKeys,
      setRecording,
      refreshUserBindings,
      saveUserBindings,
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
      setContextKeys,
      setRecording,
      refreshUserBindings,
      saveUserBindings,
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

export function useContextKey(
  key: string,
  value: string | boolean | undefined,
) {
  const { setContextKeys } = useKeymap();
  useEffect(() => {
    setContextKeys({ [key]: value });
  }, [key, value, setContextKeys]);
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
