/**
 * Desktop notification preferences live in the main process (OS banners are
 * shown there) and are mirrored to the renderer through IPC.
 */
export interface DesktopNotificationPreferences {
  /** When false, the app records history but never shows OS banners. */
  osEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: DesktopNotificationPreferences =
  {
    osEnabled: true,
  };

export interface DesktopNotificationPreferencesSetInput {
  osEnabled: boolean;
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

export function readNotificationPreferencesFromConfig(
  value: unknown,
): DesktopNotificationPreferences {
  if (value === null || typeof value !== "object") {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }
  const osEnabled = (value as { osEnabled?: unknown }).osEnabled;
  return {
    osEnabled: osEnabled === false ? false : true,
  };
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
  return typeof (value as { osEnabled?: unknown }).osEnabled === "boolean";
}
