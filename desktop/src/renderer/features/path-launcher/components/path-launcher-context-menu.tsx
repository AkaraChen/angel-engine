import type { PathLauncherActionId } from "@shared/path-launcher";
import type { ReactElement, ReactNode } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PathLauncherMenuItems } from "./path-launcher-menu-items";

interface PathLauncherContextMenuProps {
  asChild?: boolean;
  children: ReactNode;
  onSelect: (action: PathLauncherActionId) => void;
}

/** Context menu for a surface whose only actions are path-launcher actions. */
export function PathLauncherContextMenu({
  asChild = true,
  children,
  onSelect,
}: PathLauncherContextMenuProps): ReactElement {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild={asChild}>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <PathLauncherMenuItems onSelect={onSelect} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
