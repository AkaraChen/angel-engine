import type { SettingsTab } from "@/features/settings/settings-tabs";

import { useCallback, useEffect, useState } from "react";

import {
  defaultSettingsTab,
  settingsTabs,
} from "@/features/settings/settings-tabs";

const SETTINGS_TAB_QUERY_KEY = "tab";
const SETTINGS_PATH = "/settings";

function splitHash() {
  const [path = SETTINGS_PATH, query = ""] = window.location.hash
    .replace(/^#/, "")
    .split("?");

  return { params: new URLSearchParams(query), path };
}

function readSettingsTabFromLocation(): SettingsTab {
  const requested = splitHash().params.get(SETTINGS_TAB_QUERY_KEY);

  return (
    settingsTabs.find((tab) => tab.id === requested)?.id ?? defaultSettingsTab
  );
}

/**
 * The settings window mounts no router (see `main.tsx`), so the active tab
 * lives directly in the `#/settings?tab=…` query. That keeps the pane across a
 * renderer reload and lets the main process deep-link one. History is replaced
 * rather than pushed: the window has no back affordance, so a growing history
 * stack would only be a trap.
 */
export function useSettingsTab(): [SettingsTab, (tab: SettingsTab) => void] {
  const [activeTab, setActiveTab] = useState(readSettingsTabFromLocation);

  useEffect(() => {
    const syncFromLocation = () => setActiveTab(readSettingsTabFromLocation());

    window.addEventListener("hashchange", syncFromLocation);
    return () => window.removeEventListener("hashchange", syncFromLocation);
  }, []);

  const selectTab = useCallback((tab: SettingsTab) => {
    const { params, path } = splitHash();
    params.set(SETTINGS_TAB_QUERY_KEY, tab);
    window.history.replaceState(null, "", `#${path}?${params.toString()}`);
    setActiveTab(tab);
  }, []);

  return [activeTab, selectTab];
}
