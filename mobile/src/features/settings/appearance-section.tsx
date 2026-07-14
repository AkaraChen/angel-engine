import type { ThemeMode } from "@/features/settings/theme";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  SettingsRow,
  SettingsSection,
} from "@/features/settings/settings-section";
import { themeModeOptions } from "@/features/settings/theme";
import { languageOptions } from "@/i18n";

export function AppearanceSection() {
  const { t, i18n } = useTranslation();
  // Client-only SPA: next-themes reads the stored value synchronously on mount,
  // so `theme` is already correct on first paint — no mount guard needed.
  const { theme, setTheme } = useTheme();
  const value = (theme as ThemeMode | undefined) ?? "system";

  return (
    <SettingsSection title={t("settings.appearance.title")}>
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
              const label = t(option.labelKey);
              return (
                <ToggleGroupItem
                  aria-label={label}
                  className="flex-1"
                  key={option.value}
                  value={option.value}
                >
                  <Icon size={16} />
                  <span>{label}</span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        }
        description={t("settings.appearance.themeDescription")}
        title={t("settings.appearance.theme")}
      />
      <SettingsRow
        control={
          <NativeSelect
            aria-label={t("settings.appearance.language")}
            className="w-full"
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
            value={i18n.resolvedLanguage}
          >
            {languageOptions.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {t(option.labelKey)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        }
        description={t("settings.appearance.languageDescription")}
        title={t("settings.appearance.language")}
      />
    </SettingsSection>
  );
}
