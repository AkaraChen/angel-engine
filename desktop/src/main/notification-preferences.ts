import type { DesktopNotificationPreferences } from "../shared/notification-preferences";

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { app } from "electron";
import log from "electron-log/main";

import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  readNotificationPreferencesFromConfig,
} from "../shared/notification-preferences";

function preferencesPath() {
  return path.join(app.getPath("userData"), "notifications.json");
}

export function readNotificationPreferences(): DesktopNotificationPreferences {
  try {
    return readNotificationPreferencesFromConfig(
      JSON.parse(readFileSync(preferencesPath(), "utf8")),
    );
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
}

export function writeNotificationPreferences(
  preferences: DesktopNotificationPreferences,
) {
  try {
    writeFileSync(
      preferencesPath(),
      `${JSON.stringify({
        needsInput: preferences.needsInput,
        osEnabled: preferences.osEnabled,
        runCompleted: preferences.runCompleted,
        runFailed: preferences.runFailed,
        sound: preferences.sound,
        version: preferences.version,
      })}\n`,
    );
  } catch (error: unknown) {
    // The preference still applies to this session; only persistence is lost.
    log.warn("Could not persist notification preferences.", error);
  }
}
