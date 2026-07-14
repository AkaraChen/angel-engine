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
  | "agents"
  | "appearance"
  | "mobile"
  | "workspace"
  | "archived"
  | "danger";

const settingsTabs: Array<{
  icon: ComponentType<Pick<IconProps, "className" | "weight">>;
  id: SettingsTab;
  labelKey: string;
}> = [
  { icon: Bot, id: "agents", labelKey: "settings.tabs.agents" },
  { icon: PaletteIcon, id: "appearance", labelKey: "settings.tabs.appearance" },
  { icon: MobileIcon, id: "mobile", labelKey: "settings.tabs.mobile" },
  { icon: ComputerIcon, id: "workspace", labelKey: "settings.tabs.workspace" },
  { icon: ArchiveIcon, id: "archived", labelKey: "settings.tabs.archived" },
  { icon: AlertTriangle, id: "danger", labelKey: "settings.tabs.danger" },
];

export { settingsTabs };
export type { SettingsTab };
