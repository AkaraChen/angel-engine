import { Switch as SwitchPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/platform/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        `
          peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center
          rounded-full border border-transparent bg-foreground/18
          transition-colors outline-none
          disabled:cursor-not-allowed disabled:opacity-60
          focus-visible:ring-3 focus-visible:ring-primary/15
          data-[state=checked]:bg-primary
        `,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="
          pointer-events-none block size-4 translate-x-0.5 rounded-full
          bg-background shadow-sm transition-transform duration-260
          [transition-timing-function:cubic-bezier(0.34,1.3,0.64,1)]
          data-[state=checked]:translate-x-4
        "
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
