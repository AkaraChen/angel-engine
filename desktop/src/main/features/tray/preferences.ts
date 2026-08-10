import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";
import {
  type DesktopTrayPreferences,
  sanitizeTrayPreferences,
} from "../../../shared/tray";

function preferencesPath() {
  return path.join(app.getPath("userData"), "tray.json");
}

export function readTrayPreferences(): DesktopTrayPreferences {
  try {
    return sanitizeTrayPreferences(
      JSON.parse(readFileSync(preferencesPath(), "utf8")),
    );
  } catch {
    return sanitizeTrayPreferences(undefined);
  }
}

export function writeTrayPreferences(preferences: DesktopTrayPreferences) {
  try {
    writeFileSync(
      preferencesPath(),
      `${JSON.stringify(sanitizeTrayPreferences(preferences))}\n`,
    );
  } catch (error: unknown) {
    log.warn("Could not persist tray preferences.", error);
  }
}
