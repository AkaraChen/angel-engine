import type {
  DesktopNotificationHistory,
  DesktopNotificationItem,
  DesktopNotificationPreferences,
} from "@shared/notification-preferences";

import { useSyncExternalStore } from "react";

import { DEFAULT_NOTIFICATION_PREFERENCES } from "@shared/notification-preferences";

interface NotificationCenterState {
  history: DesktopNotificationHistory;
  preferences: DesktopNotificationPreferences;
  ready: boolean;
}

type Listener = () => void;

let state: NotificationCenterState = {
  history: { items: [] },
  preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
  ready: false,
};
const listeners = new Set<Listener>();
let started = false;

function emit() {
  for (const listener of listeners) listener();
}

function setState(next: Partial<NotificationCenterState>) {
  state = { ...state, ...next };
  emit();
}

export function startNotificationCenterStore() {
  if (started) return () => undefined;
  started = true;

  void window.desktopWindow.getNotificationHistory().then((history) => {
    setState({ history, ready: true });
  });
  void window.desktopWindow.getNotificationPreferences().then((preferences) => {
    setState({ preferences });
  });

  const stopHistory = window.desktopWindow.onNotificationHistoryChanged(
    (history) => {
      setState({ history, ready: true });
    },
  );

  return () => {
    stopHistory();
    started = false;
  };
}

export function useNotificationCenterStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNotificationHistoryItems(): DesktopNotificationItem[] {
  return useNotificationCenterStore().history.items;
}

export function useNotificationUnreadCount() {
  return useNotificationHistoryItems().filter((item) => !item.read).length;
}

export function useOsNotificationsEnabled() {
  return useNotificationCenterStore().preferences.osEnabled;
}

export async function setOsNotificationsEnabled(osEnabled: boolean) {
  const preferences = await window.desktopWindow.setNotificationPreferences({
    osEnabled,
  });
  setState({ preferences });
  return preferences;
}

export async function clearNotificationHistory() {
  const history = await window.desktopWindow.clearNotificationHistory();
  setState({ history });
  return history;
}

export async function markNotificationHistoryRead(ids: string[]) {
  if (ids.length === 0) return state.history;
  const history = await window.desktopWindow.markNotificationHistoryRead(ids);
  setState({ history });
  return history;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}
