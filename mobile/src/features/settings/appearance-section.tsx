import type { ThemeMode } from "@/features/settings/theme";
import { useTheme } from "next-themes";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SettingsRow,
  SettingsSection,
} from "@/features/settings/settings-section";
import { themeModeOptions } from "@/features/settings/theme";

export function AppearanceSection() {
  // Client-only SPA: next-themes reads the stored value synchronously on mount,
  // so `theme` is already correct on first paint — no mount guard needed.
  const { theme, setTheme } = useTheme();
  const value = (theme as ThemeMode | undefined) ?? "system";

  return (
    <SettingsSection title="Appearance">
      <SettingsRow
        control={
          <ToggleGroup
            className="w-full"
            onValueChange={(next) => {
              // ToggleGroup emits "" when the active item is re-pressed; keep
              // the current selection instead of clearing the theme.
              if (next) setTheme(next);
            }}
            spacing={0}
            type="single"
            value={value}
            variant="outline"
          >
            {themeModeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <ToggleGroupItem
                  aria-label={option.label}
                  className="flex-1"
                  key={option.value}
                  value={option.value}
                >
                  <Icon size={16} />
                  <span>{option.label}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        }
        description="Choose how the app looks on this device."
        title="Theme"
      />
    </SettingsSection>
  );
}
