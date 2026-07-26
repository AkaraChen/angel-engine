import type { IconProps } from "@phosphor-icons/react";
import type { ComponentType } from "react";

import {
  WarningCircle as AlertTriangle,
  Archive as ArchiveIcon,
  Robot as Bot,
  Monitor as ComputerIcon,
  DeviceMobile as MobileIcon,
  Palette as PaletteIcon,
} from "@phosphor-icons/react";

type SettingsTab =
  | "appearance"
  | "workspace"
  | "agents"
  | "mobile"
  | "archived"
  | "danger";

type SettingsTabGroup = "general" | "connectivity" | "data";

interface SettingsTabDefinition {
  descriptionKey: string;
  group: SettingsTabGroup;
  icon: ComponentType<Pick<IconProps, "className" | "weight">>;
  id: SettingsTab;
  labelKey: string;
  /** Table-like panes opt out of the narrow reading-column cap. */
  wide?: boolean;
}

/**
 * Flat, display-ordered list. Roving-tabindex keyboard navigation walks this
 * array, so its order must stay in sync with the rendered order of the rail.
 */
const settingsTabs: SettingsTabDefinition[] = [
  {
    descriptionKey: "settings.tabDescriptions.appearance",
    group: "general",
    icon: PaletteIcon,
    id: "appearance",
    labelKey: "settings.tabs.appearance",
  },
  {
    descriptionKey: "settings.tabDescriptions.workspace",
    group: "general",
    icon: ComputerIcon,
    id: "workspace",
    labelKey: "settings.tabs.workspace",
  },
  {
    descriptionKey: "settings.tabDescriptions.agents",
    group: "general",
    icon: Bot,
    id: "agents",
    labelKey: "settings.tabs.agents",
  },
  {
    descriptionKey: "settings.tabDescriptions.mobile",
    group: "connectivity",
    icon: MobileIcon,
    id: "mobile",
    labelKey: "settings.tabs.mobile",
  },
  {
    descriptionKey: "settings.tabDescriptions.archived",
    group: "data",
    icon: ArchiveIcon,
    id: "archived",
    labelKey: "settings.tabs.archived",
    wide: true,
  },
  {
    descriptionKey: "settings.tabDescriptions.danger",
    group: "data",
    icon: AlertTriangle,
    id: "danger",
    labelKey: "settings.tabs.danger",
  },
];

const settingsTabGroupLabelKeys: Record<SettingsTabGroup, string> = {
  connectivity: "settings.groups.connectivity",
  data: "settings.groups.data",
  general: "settings.groups.general",
};

const settingsTabGroups = (["general", "connectivity", "data"] as const).map(
  (group) => ({
    group,
    labelKey: settingsTabGroupLabelKeys[group],
    tabs: settingsTabs.filter((tab) => tab.group === group),
  }),
);

const defaultSettingsTab: SettingsTab = settingsTabs[0].id;

function findSettingsTab(id: SettingsTab): SettingsTabDefinition {
  const tab = settingsTabs.find((candidate) => candidate.id === id);
  if (!tab) throw new Error(`Unknown settings tab: ${id}`);

  return tab;
}

export { defaultSettingsTab, findSettingsTab, settingsTabGroups, settingsTabs };
export type { SettingsTab };
