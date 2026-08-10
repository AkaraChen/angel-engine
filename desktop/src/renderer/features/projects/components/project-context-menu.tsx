import type { Project } from "@angel-engine/daemon-api/projects";
import type { PathLauncherActionId } from "@shared/path-launcher";
import type { ReactElement, ReactNode } from "react";
import type { ProjectContextMenuAction } from "@/features/projects/api/queries";

import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PathLauncherMenuItems } from "@/features/path-launcher/components/path-launcher-menu-items";

interface ProjectContextMenuProps {
  children: ReactNode;
  onAction: (project: Project, action: ProjectContextMenuAction) => void;
  onPathLauncherAction: (
    project: Project,
    action: PathLauncherActionId,
  ) => void;
  project: Project;
}

export function ProjectContextMenu({
  children,
  onAction,
  onPathLauncherAction,
  project,
}: ProjectContextMenuProps): ReactElement {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <PathLauncherMenuItems
          onSelect={(action) => onPathLauncherAction(project, action)}
        />
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onAction(project, "settings")}>
          {t("projects.settings")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onAction(project, "delete")}
          variant="destructive"
        >
          {t("common.delete")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
