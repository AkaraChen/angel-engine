/**
 * Desktop notification preferences live in the main process (OS banners are
 * shown there) and are mirrored to the renderer through IPC.
 *
 * Defaults reproduce historical behavior: every eligible completed, failed, and
 * needs-input event may create an audible OS notification when the window is
 * backgrounded. Master off preserves child choices for later re-enable.
 */

export const DESKTOP_NOTIFICATION_PREFERENCES_VERSION = 1 as const;

export interface DesktopNotificationPreferences {
  /** When false, the app records history but never shows OS banners. */
  osEnabled: boolean;
  /** OS banners for needs-input / elicitation events. */
  needsInput: boolean;
  /** OS banners for successful turn completion. */
  runCompleted: boolean;
  /** OS banners for failed turns. */
  runFailed: boolean;
  /** When false, OS notifications are silent. */
  sound: boolean;
  version: typeof DESKTOP_NOTIFICATION_PREFERENCES_VERSION;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: DesktopNotificationPreferences =
  {
    needsInput: true,
    osEnabled: true,
    runCompleted: true,
    runFailed: true,
    sound: true,
    version: DESKTOP_NOTIFICATION_PREFERENCES_VERSION,
  };

export interface DesktopNotificationPreferencesSetInput {
  needsInput?: boolean;
  osEnabled?: boolean;
  runCompleted?: boolean;
  runFailed?: boolean;
  sound?: boolean;
}

export type DesktopNotificationKind = "completed" | "failed" | "needsInput";

export interface DesktopNotificationItem {
  body: string;
  chatId: string;
  createdAt: string;
  id: string;
  kind: DesktopNotificationKind;
  projectId?: string | null;
  read: boolean;
  title: string;
}

export interface DesktopNotificationHistory {
  items: DesktopNotificationItem[];
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

/**
 * Normalize persisted or IPC payloads into a full preferences object.
 * Missing fields fall back to defaults so older `{ osEnabled }` files migrate
 * without changing current notification behavior.
 */
export function readNotificationPreferencesFromConfig(
  value: unknown,
): DesktopNotificationPreferences {
  if (value === null || typeof value !== "object") {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const record = value as Record<string, unknown>;
  return {
    needsInput: readBoolean(
      record.needsInput,
      DEFAULT_NOTIFICATION_PREFERENCES.needsInput,
    ),
    osEnabled: readBoolean(
      record.osEnabled,
      DEFAULT_NOTIFICATION_PREFERENCES.osEnabled,
    ),
    runCompleted: readBoolean(
      record.runCompleted,
      DEFAULT_NOTIFICATION_PREFERENCES.runCompleted,
    ),
    runFailed: readBoolean(
      record.runFailed,
      DEFAULT_NOTIFICATION_PREFERENCES.runFailed,
    ),
    sound: readBoolean(record.sound, DEFAULT_NOTIFICATION_PREFERENCES.sound),
    version: DESKTOP_NOTIFICATION_PREFERENCES_VERSION,
  };
}

/**
 * Merge a partial preference update into the current preferences.
 * Unspecified keys keep their prior values (master does not reset children).
 */
export function mergeNotificationPreferences(
  current: DesktopNotificationPreferences,
  input: unknown,
): DesktopNotificationPreferences {
  if (input === null || typeof input !== "object") {
    return { ...current, version: DESKTOP_NOTIFICATION_PREFERENCES_VERSION };
  }
  const record = input as Record<string, unknown>;
  return {
    needsInput:
      record.needsInput === undefined
        ? current.needsInput
        : readBoolean(record.needsInput, current.needsInput),
    osEnabled:
      record.osEnabled === undefined
        ? current.osEnabled
        : readBoolean(record.osEnabled, current.osEnabled),
    runCompleted:
      record.runCompleted === undefined
        ? current.runCompleted
        : readBoolean(record.runCompleted, current.runCompleted),
    runFailed:
      record.runFailed === undefined
        ? current.runFailed
        : readBoolean(record.runFailed, current.runFailed),
    sound:
      record.sound === undefined
        ? current.sound
        : readBoolean(record.sound, current.sound),
    version: DESKTOP_NOTIFICATION_PREFERENCES_VERSION,
  };
}

/**
 * Whether the main process should construct an OS notification for this kind.
 * History recording is independent and always allowed.
 */
export function shouldShowOsNotification(
  preferences: DesktopNotificationPreferences,
  kind: DesktopNotificationKind,
): boolean {
  if (!preferences.osEnabled) return false;
  switch (kind) {
    case "completed":
      return preferences.runCompleted;
    case "failed":
      return preferences.runFailed;
    case "needsInput":
      return preferences.needsInput;
  }
}

export function isDesktopNotificationItem(
  value: unknown,
): value is DesktopNotificationItem {
  if (value === null || typeof value !== "object") return false;
  const item = value as Partial<DesktopNotificationItem>;
  return (
    typeof item.body === "string" &&
    typeof item.chatId === "string" &&
    typeof item.createdAt === "string" &&
    typeof item.id === "string" &&
    (item.kind === "completed" ||
      item.kind === "failed" ||
      item.kind === "needsInput") &&
    typeof item.read === "boolean" &&
    typeof item.title === "string" &&
    (item.projectId === undefined ||
      item.projectId === null ||
      typeof item.projectId === "string")
  );
}

export function isDesktopNotificationHistory(
  value: unknown,
): value is DesktopNotificationHistory {
  if (value === null || typeof value !== "object") return false;
  const items = (value as { items?: unknown }).items;
  return Array.isArray(items) && items.every(isDesktopNotificationItem);
}

export function isDesktopNotificationPreferences(
  value: unknown,
): value is DesktopNotificationPreferences {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<DesktopNotificationPreferences>;
  return (
    typeof record.osEnabled === "boolean" &&
    typeof record.needsInput === "boolean" &&
    typeof record.runCompleted === "boolean" &&
    typeof record.runFailed === "boolean" &&
    typeof record.sound === "boolean"
  );
}
