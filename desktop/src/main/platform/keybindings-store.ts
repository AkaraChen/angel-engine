import { createHash } from "node:crypto";
import { readFileSync, existsSync, copyFileSync, watch } from "node:fs";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import log from "electron-log/main";

import type {
  KeybindingsFile,
  LoadWarning,
  LoadFatal,
} from "../../shared/keybindings";
import {
  emptyKeybindingsFile,
  KEYMAP_USER_BINDINGS_CHANGED_CHANNEL,
  migrateUserBindings,
  parseKeybindingsJson,
  serializeKeybindingsFile,
} from "../../shared/keybindings";
import { writeFileAtomic } from "./atomic-write";

export { KEYMAP_USER_BINDINGS_CHANGED_CHANNEL };

function syncApplicationMenu() {
  // Lazy import avoids circular init with application-menu ↔ keybindings-store.
  void import("./application-menu")
    .then((mod) => {
      mod.rebuildApplicationMenu();
    })
    .catch(() => {
      // Menu may not be configured yet during early boot / tests.
    });
}

export interface KeybindingsLoadState {
  file: KeybindingsFile;
  warnings: LoadWarning[];
  fatal?: LoadFatal;
  path: string;
}

let cached: KeybindingsLoadState | null = null;
let lastWriteHash: string | null = null;
let watcher: ReturnType<typeof watch> | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

function keybindingsPath() {
  return path.join(app.getPath("userData"), "keybindings.json");
}

function hashContents(contents: string) {
  return createHash("sha256").update(contents).digest("hex");
}

function broadcast(state: KeybindingsLoadState) {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.webContents.send(KEYMAP_USER_BINDINGS_CHANGED_CHANNEL, state);
  }
}

export function loadKeybindingsFromDisk(): KeybindingsLoadState {
  const filePath = keybindingsPath();
  if (!existsSync(filePath)) {
    cached = {
      file: emptyKeybindingsFile(),
      warnings: [],
      path: filePath,
    };
    return cached;
  }

  try {
    const text = readFileSync(filePath, "utf8");
    const parsed = parseKeybindingsJson(text);
    const migrated = migrateUserBindings(parsed);
    cached = {
      file: migrated.file,
      warnings: migrated.warnings,
      fatal: migrated.fatal,
      path: filePath,
    };
    return cached;
  } catch (error: unknown) {
    log.warn("Failed to load keybindings.json; using defaults.", error);
    cached = {
      file: emptyKeybindingsFile(),
      warnings: [],
      fatal: {
        kind: "parse-error",
        message: error instanceof Error ? error.message : String(error),
      },
      path: filePath,
    };
    return cached;
  }
}

export function getKeybindingsState(): KeybindingsLoadState {
  return cached ?? loadKeybindingsFromDisk();
}

export async function setKeybindingsFile(
  file: KeybindingsFile,
): Promise<KeybindingsLoadState> {
  const migrated = migrateUserBindings(file);
  if (migrated.fatal) {
    const state: KeybindingsLoadState = {
      file: emptyKeybindingsFile(),
      warnings: migrated.warnings,
      fatal: migrated.fatal,
      path: keybindingsPath(),
    };
    return state;
  }

  const normalized: KeybindingsFile = {
    version: 1,
    bindings: migrated.entries,
  };
  const contents = serializeKeybindingsFile(normalized);
  const filePath = keybindingsPath();
  lastWriteHash = hashContents(contents);
  await writeFileAtomic(filePath, contents);
  cached = {
    file: normalized,
    warnings: migrated.warnings,
    path: filePath,
  };
  broadcast(cached);
  syncApplicationMenu();
  return cached;
}

export async function resetAllKeybindings(): Promise<KeybindingsLoadState> {
  const filePath = keybindingsPath();
  if (existsSync(filePath)) {
    try {
      copyFileSync(filePath, `${filePath}.bak`);
    } catch (error: unknown) {
      log.warn("Could not backup keybindings.json before reset.", error);
    }
  }
  return setKeybindingsFile(emptyKeybindingsFile());
}

export async function restoreKeybindingsBackup(): Promise<KeybindingsLoadState | null> {
  const filePath = keybindingsPath();
  const bak = `${filePath}.bak`;
  if (!existsSync(bak)) return null;
  const text = readFileSync(bak, "utf8");
  const parsed = parseKeybindingsJson(text);
  const migrated = migrateUserBindings(parsed);
  return setKeybindingsFile(migrated.file);
}

export function openKeybindingsInEditor() {
  const filePath = keybindingsPath();
  if (!existsSync(filePath)) {
    const contents = serializeKeybindingsFile(emptyKeybindingsFile());
    void writeFileAtomic(filePath, contents).then(() => {
      void shellOpen(filePath);
    });
    return;
  }
  void shellOpen(filePath);
}

async function shellOpen(filePath: string) {
  const { shell } = await import("electron");
  await shell.openPath(filePath);
}

export function startKeybindingsWatcher() {
  if (watcher) return;
  const filePath = keybindingsPath();
  const dir = path.dirname(filePath);
  try {
    watcher = watch(dir, (eventType, filename) => {
      if (filename && filename !== "keybindings.json") return;
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        try {
          if (existsSync(filePath)) {
            const text = readFileSync(filePath, "utf8");
            if (lastWriteHash && hashContents(text) === lastWriteHash) {
              return;
            }
          }
          const state = loadKeybindingsFromDisk();
          broadcast(state);
          syncApplicationMenu();
        } catch (error: unknown) {
          log.warn("keybindings hot-reload failed", error);
        }
      }, 80);
    });
  } catch (error: unknown) {
    log.warn("Could not watch keybindings.json", error);
  }
}

export function stopKeybindingsWatcher() {
  watcher?.close();
  watcher = null;
}
