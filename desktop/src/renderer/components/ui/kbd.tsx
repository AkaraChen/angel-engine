import type { ComponentProps, FC } from "react";

import { cn } from "@/platform/utils";

type KbdProps = ComponentProps<"kbd">;

const Kbd: FC<KbdProps> = ({ className, ...props }) => (
  <kbd
    data-slot="kbd"
    className={cn(
      `
        inline-flex h-5 min-w-5 items-center justify-center rounded-md
        border border-border-subtle bg-muted px-1.5 font-mono text-[0.6875rem]
        leading-none font-medium text-muted-foreground shadow-xs select-none
        in-data-[slot=tooltip-content]:border-tooltip-foreground/15
        in-data-[slot=tooltip-content]:bg-tooltip-foreground/12
        in-data-[slot=tooltip-content]:text-tooltip-foreground
      `,
      className,
    )}
    {...props}
  />
);

type KbdGroupProps = ComponentProps<"span">;

const KbdGroup: FC<KbdGroupProps> = ({ className, ...props }) => (
  <span
    data-slot="kbd-group"
    className={cn("inline-flex items-center gap-1", className)}
    {...props}
  />
);

export { Kbd, KbdGroup };
export type { KbdGroupProps, KbdProps };
