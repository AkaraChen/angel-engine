import { RiCheckLine as CheckIcon } from "@remixicon/react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/platform/utils";

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        `
          peer inline-flex size-4 shrink-0 items-center justify-center
          rounded-[4px] border border-input bg-background text-primary-foreground
          shadow-xs transition-[color,background-color,border-color,box-shadow]
          outline-none
          focus-visible:border-ring focus-visible:ring-2
          focus-visible:ring-ring/30
          disabled:cursor-not-allowed disabled:opacity-50
          data-[state=checked]:border-primary data-[state=checked]:bg-primary
        `,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center"
      >
        <CheckIcon className="size-3.5" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
