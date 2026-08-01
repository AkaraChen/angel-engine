import { useTranslation } from "react-i18next";

import { AppearanceSection } from "@/features/settings/appearance-section";
import { CustomAgentsSection } from "@/features/settings/custom-agents-section";
import { ProjectsSection } from "@/features/settings/projects-section";
import {
  SettingsRow,
  SettingsSection,
} from "@/features/settings/settings-section";

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="
          mx-auto flex max-w-xl flex-col gap-6 p-4
          pb-[max(1rem,env(safe-area-inset-bottom))]
        "
      >
        <ProjectsSection />
        <CustomAgentsSection />
        <AppearanceSection />

        <SettingsSection
          description={t("settings.about.description")}
          title={t("settings.about.title")}
        >
          <SettingsRow
            description={t("settings.about.appDescription")}
            title={t("settings.about.appName")}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
