import type { KeyboardEvent } from "react";
import type { SettingsTab } from "@/features/settings/settings-tabs";

import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import {
  settingsTabGroups,
  settingsTabs,
} from "@/features/settings/settings-tabs";
import { cn } from "@/platform/utils";

/**
 * Left rail of the settings window. Behaves as a single vertical tablist with
 * roving tabindex; the visual grouping is presentational only, so arrow keys
 * walk every tab in display order regardless of group boundaries.
 *
 * On macOS the window is frameless, so the rail reserves the traffic-light
 * inset itself and claims the whole area as a drag region.
 */
export function SettingsNav({
  activeTab,
  onActiveTabChange,
  tabPanelId,
}: {
  activeTab: SettingsTab;
  onActiveTabChange: (tab: SettingsTab) => void;
  tabPanelId: string;
}) {
  const { t } = useTranslation();
  const isMacOS = window.desktopEnvironment.platform === "darwin";

  const focusTab = useCallback(
    (tab: SettingsTab) => {
      onActiveTabChange(tab);
      window.requestAnimationFrame(() => {
        document.getElementById(`${tabPanelId}-${tab}-tab`)?.focus();
      });
    },
    [onActiveTabChange, tabPanelId],
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, tab: SettingsTab) => {
      const currentIndex = settingsTabs.findIndex(
        (candidate) => candidate.id === tab,
      );

      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        const previous =
          (currentIndex - 1 + settingsTabs.length) % settingsTabs.length;
        focusTab(settingsTabs[previous].id);
      } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        focusTab(settingsTabs[(currentIndex + 1) % settingsTabs.length].id);
      } else if (event.key === "Home") {
        event.preventDefault();
        focusTab(settingsTabs[0].id);
      } else if (event.key === "End") {
        event.preventDefault();
        focusTab(settingsTabs[settingsTabs.length - 1].id);
      }
    },
    [focusTab],
  );

  return (
    <aside
      className="
        flex w-56 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border
        bg-sidebar/70 px-2.5 pb-4
        supports-backdrop-filter:backdrop-blur-xl
      "
      data-electron-drag
      style={{ paddingTop: isMacOS ? 44 : 16 }}
    >
      <h1
        className="
          px-2 pb-3 font-display text-sm font-semibold tracking-[-0.01em]
          text-sidebar-foreground
        "
      >
        {t("settings.title")}
      </h1>
      <nav
        aria-label={t("settings.title")}
        aria-orientation="vertical"
        className="flex flex-col gap-4"
        data-electron-no-drag
        role="tablist"
      >
        {settingsTabGroups.map(({ group, labelKey, tabs }) => (
          <div className="flex flex-col gap-0.5" key={group}>
            <span
              aria-hidden="true"
              className="
                px-2 pb-1 text-[11px] font-medium tracking-[0.05em] uppercase
                text-muted-foreground/80
              "
            >
              {t(labelKey)}
            </span>
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  aria-controls={`${tabPanelId}-${tab.id}`}
                  aria-selected={isActive}
                  className={cn(
                    `
                      flex h-8 items-center gap-2.5 rounded-lg px-2 text-left
                      text-sm font-medium outline-none
                      focus-visible:ring-2 focus-visible:ring-ring/40
                    `,
                    isActive
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : `
                        text-sidebar-foreground/75
                        hover:bg-overlay-hover
                        hover:text-sidebar-accent-foreground
                      `,
                  )}
                  id={`${tabPanelId}-${tab.id}-tab`}
                  key={tab.id}
                  onClick={() => onActiveTabChange(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  type="button"
                >
                  <TabIcon className="size-4 shrink-0" weight="duotone" />
                  <span className="truncate">{t(tab.labelKey)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
