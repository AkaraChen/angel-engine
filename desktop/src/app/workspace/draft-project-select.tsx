import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { getProjectDisplayName } from "@/app/workspace/workspace-display";
import type { Project } from "@/shared/projects";

const NO_PROJECT_SELECT_VALUE = "__angel_no_project__";

export function DraftProjectSelect({
  onProjectChange,
  projects,
  selectedProjectId,
}: {
  onProjectChange: (projectId: string | null) => void;
  projects: Project[];
  selectedProjectId?: string;
}) {
  const { t } = useTranslation();
  const value = selectedProjectId ?? NO_PROJECT_SELECT_VALUE;

  return (
    <div className="relative w-fit max-w-[18rem]">
      <Folder className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground/85" />
      <NativeSelect
        aria-label={t("workspace.projectSelect")}
        className="max-w-[18rem]"
        onChange={(event) => {
          const nextValue = event.currentTarget.value;
          onProjectChange(
            nextValue === NO_PROJECT_SELECT_VALUE ? null : nextValue,
          );
        }}
        selectClassName="h-8 max-w-[18rem] rounded-md border border-foreground/[0.08] bg-background/88 py-0 pr-8 pl-8 text-xs shadow-[0_8px_18px_-18px_rgba(0,0,0,0.55)] backdrop-blur-xl hover:bg-background/92 focus-visible:!border-foreground/12 focus-visible:!ring-0 dark:border-white/[0.09] dark:bg-card/86 dark:shadow-[0_10px_20px_-20px_rgba(0,0,0,0.72)] dark:hover:bg-card/90 dark:focus-visible:!border-white/14"
        size="sm"
        title={t("workspace.projectSelect")}
        value={value}
      >
        <NativeSelectOption value={NO_PROJECT_SELECT_VALUE}>
          {t("workspace.noProject")}
        </NativeSelectOption>
        {projects.map((project) => {
          const projectName = getProjectDisplayName(project.path);

          return (
            <NativeSelectOption
              key={project.id}
              title={project.path}
              value={project.id}
            >
              {projectName}
            </NativeSelectOption>
          );
        })}
      </NativeSelect>
    </div>
  );
}
