import type { ReactElement } from "react";

import { FolderPlus, GitBranch, FolderOpen } from "@phosphor-icons/react";
import { m } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sidebarMotion } from "@/components/workspace-sidebar-motion";

interface AddProjectMenuProps {
  onChooseFolder: () => void;
  onCloneRepository: () => void;
}

/**
 * The sidebar's "add project" affordance. It opens a menu because a project can
 * come from more than one source; folder picking stays the first entry so the
 * previous one-click flow is still one keystroke away.
 */
export function AddProjectMenu({
  onChooseFolder,
  onCloneRepository,
}: AddProjectMenuProps): ReactElement {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          asChild
          className="
            size-7
            [&_svg:not([class*='size-'])]:size-4
          "
          size="icon-xs"
          title={t("sidebar.addProject")}
          variant="ghost"
        >
          <m.button
            title={t("sidebar.addProject")}
            transition={sidebarMotion}
            type="button"
            whileTap={{ scale: 0.96 }}
          >
            <FolderPlus />
            <span className="sr-only">{t("sidebar.addProject")}</span>
          </m.button>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" variant="native">
        <DropdownMenuItem onSelect={onChooseFolder}>
          <FolderOpen className="size-3.5" weight="regular" />
          <span>{t("projectImport.addFromFolder")}</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onCloneRepository}>
          <GitBranch className="size-3.5" weight="regular" />
          <span>{t("projectImport.addFromGit")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
