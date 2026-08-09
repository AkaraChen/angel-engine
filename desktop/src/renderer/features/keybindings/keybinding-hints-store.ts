import { create } from "zustand";

const keybindingHintsStorageKey = "angel-engine.keybinding-hints-enabled";

interface KeybindingHintsState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

const useKeybindingHintsStore = create<KeybindingHintsState>()((set, get) => ({
  enabled: readKeybindingHintsEnabled(),
  setEnabled: (enabled) => {
    if (get().enabled === enabled) return;

    writeKeybindingHintsEnabled(enabled);
    set({ enabled });
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== keybindingHintsStorageKey) return;

    useKeybindingHintsStore.setState({
      enabled: sanitizeKeybindingHintsEnabled(event.newValue),
    });
  });
}

function readKeybindingHintsEnabled() {
  try {
    return sanitizeKeybindingHintsEnabled(
      window.localStorage.getItem(keybindingHintsStorageKey),
    );
  } catch {
    return true;
  }
}

function writeKeybindingHintsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(
      keybindingHintsStorageKey,
      enabled ? "true" : "false",
    );
  } catch {
    // The preference remains live for this window when storage is unavailable.
  }
}

function sanitizeKeybindingHintsEnabled(value: unknown) {
  return value !== false && value !== "false";
}

export { useKeybindingHintsStore };
