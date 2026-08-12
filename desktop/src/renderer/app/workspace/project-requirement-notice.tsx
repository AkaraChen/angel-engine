import type { Project } from "@angel-engine/daemon-api/projects";
import type { FC } from "react";

import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export type ProjectsQueryStatus = "error" | "pending" | "success";

interface ProjectRequirementNoticeProps {
  onCreateProject: () => Project | undefined | Promise<Project | undefined>;
  projectCount: number;
  projectsStatus: ProjectsQueryStatus;
}

export const ProjectRequirementNotice: FC<ProjectRequirementNoticeProps> = ({
  onCreateProject,
  projectCount,
  projectsStatus,
}) => {
  const { t } = useTranslation();

  if (projectsStatus === "error") {
    return (
      <p className="text-sm text-destructive">
        {t("sidebar.projectsLoadError")}
      </p>
    );
  }

  if (projectsStatus !== "success" || projectCount > 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t("sidebar.loadingProjects")}
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">{t("sidebar.noProjects")}</p>
      <Button
        onClick={() => void onCreateProject()}
        size="sm"
        type="button"
        variant="outline"
      >
        {t("sidebar.addProject")}
      </Button>
    </>
  );
};
