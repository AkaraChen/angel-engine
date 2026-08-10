import { AboutSection } from "@/features/settings/about-section";
import { AgentsSection } from "@/features/settings/agents-section";
import { AppearanceSection } from "@/features/settings/appearance-section";
import { ConnectionSection } from "@/features/settings/connection-section";
import { CustomAgentsSection } from "@/features/settings/custom-agents-section";
import { ProjectsSection } from "@/features/settings/projects-section";

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div
        className="
          mx-auto flex max-w-xl flex-col gap-6 p-4
          pb-[max(1rem,env(safe-area-inset-bottom))]
        "
      >
        <ConnectionSection />
        <AgentsSection />
        <ProjectsSection />
        <CustomAgentsSection />
        <AppearanceSection />
        <AboutSection />
      </div>
    </div>
  );
}
