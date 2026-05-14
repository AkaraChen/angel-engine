import { Folder } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    <Select
      onValueChange={(nextValue) =>
        onProjectChange(
          nextValue === NO_PROJECT_SELECT_VALUE ? null : nextValue,
        )
      }
      value={value}
    >
      <SelectTrigger
        aria-label={t("workspace.projectSelect")}
        className="h-8 max-w-[18rem] justify-start rounded-full border-foreground/10 bg-background/95 px-2.5 text-xs shadow-[0_10px_30px_-22px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.8)_inset] backdrop-blur-xl hover:bg-background dark:border-white/10 dark:bg-card/95 dark:shadow-[0_10px_30px_-22px_rgba(0,0,0,0.95),0_1px_0_rgba(255,255,255,0.08)_inset]"
        size="sm"
        title={t("workspace.projectSelect")}
        type="button"
      >
        <Folder className="size-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={t("workspace.noProject")} />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-56" position="popper">
        <SelectItem value={NO_PROJECT_SELECT_VALUE}>
          {t("workspace.noProject")}
        </SelectItem>
        {projects.length > 0 ? <SelectSeparator /> : null}
        {projects.map((project) => {
          const projectName = getProjectDisplayName(project.path);

          return (
            <SelectItem key={project.id} value={project.id}>
              <span className="min-w-0 truncate" title={project.path}>
                {projectName}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
