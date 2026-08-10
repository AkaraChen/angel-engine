import type { ComponentProps, FC, ReactElement, ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KeybindingHint } from "@/features/keybindings/components/keybinding-hint";

type KeybindingTooltipProps = Omit<
  ComponentProps<typeof TooltipContent>,
  "children"
> & {
  binding?: string;
  children: ReactElement;
  label: ReactNode;
};

const KeybindingTooltip: FC<KeybindingTooltipProps> = ({
  binding,
  children,
  label,
  ...contentProps
}) => (
  <Tooltip>
    <TooltipTrigger asChild>{children}</TooltipTrigger>
    <TooltipContent {...contentProps}>
      <span>{label}</span>
      <KeybindingHint binding={binding} />
    </TooltipContent>
  </Tooltip>
);

export { KeybindingTooltip };
export type { KeybindingTooltipProps };
