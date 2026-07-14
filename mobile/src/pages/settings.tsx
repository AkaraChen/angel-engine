import { AppearanceSection } from "@/features/settings/appearance-section";
import {
  SettingsRow,
  SettingsSection,
} from "@/features/settings/settings-section";

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-xl flex-col gap-6 p-4">
        <AppearanceSection />

        <SettingsSection
          description="These settings only affect this device and are kept separate from the desktop app's configuration."
          title="About"
        >
          <SettingsRow
            description="Mobile companion for the Angel Engine desktop app."
            title="Angel Engine Mobile"
          />
        </SettingsSection>
      </div>
    </div>
  );
}
