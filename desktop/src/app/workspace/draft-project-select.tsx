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
        className="max-w-[18rem] justify-start bg-muted/40"
        size="sm"
        title={t("workspace.projectSelect")}
      >
        <Folder className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder={t("workspace.noProject")} />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-56">
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
