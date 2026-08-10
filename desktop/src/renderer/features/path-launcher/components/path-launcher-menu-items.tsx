import type { PathLauncherActionId } from "@shared/path-launcher";
import type { ReactElement } from "react";

import { Fragment } from "react";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { usePathLauncherMenuItems } from "@/features/path-launcher/use-path-launcher-menu";

interface PathLauncherMenuItemsProps {
  includeAngelTerminal?: boolean;
  onSelect: (action: PathLauncherActionId) => void;
}

/** "Open in …" / "Copy path" rows shared by every path-aware context menu. */
export function PathLauncherMenuItems({
  includeAngelTerminal,
  onSelect,
}: PathLauncherMenuItemsProps): ReactElement {
  const items = usePathLauncherMenuItems({ includeAngelTerminal });

  return (
    <>
      {items.map((item) => (
        <Fragment key={item.action}>
          {item.startsGroup === true ? <ContextMenuSeparator /> : null}
          <ContextMenuItem onSelect={() => onSelect(item.action)}>
            {item.label}
          </ContextMenuItem>
        </Fragment>
      ))}
    </>
  );
}
