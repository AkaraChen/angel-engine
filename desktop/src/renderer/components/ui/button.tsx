import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";

import { cn } from "@/platform/utils";

/**
 * The openknowledge DNA is a landing-page language where every control is a
 * capsule. In app context that would dissolve dense toolbar grids, so the
 * capsule is reserved for the primary CTA (`default`); every other variant
 * keeps a `radius-md` rectangle and a flat hover that never lifts.
 */
const buttonVariants = cva(
  `
    group/button inline-flex shrink-0 items-center justify-center
    border border-transparent bg-clip-padding text-sm font-medium
    whitespace-nowrap
    transition-[color,background-color,border-color,box-shadow,transform]
    ease-standard outline-none select-none
    active:scale-[0.98]
    disabled:pointer-events-none disabled:opacity-50
    focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
    focus-visible:ring-offset-background
    aria-invalid:border-destructive aria-invalid:ring-3
    aria-invalid:ring-destructive/20
    dark:aria-invalid:border-destructive/50
    dark:aria-invalid:ring-destructive/40
    motion-reduce:transition-none
    motion-reduce:hover:translate-y-0
    motion-reduce:active:scale-100
    [&_svg]:pointer-events-none [&_svg]:shrink-0
    [&_svg:not([class*='size-'])]:size-4
  `,
  {
    variants: {
      variant: {
        default: `
          rounded-full bg-primary leading-[115%] tracking-[-0.64px]
          text-primary-foreground duration-150
          hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-panel
          active:translate-y-0 active:bg-primary-active active:shadow-none
        `,
        soft: `
          rounded-md bg-primary-soft text-primary-soft-foreground duration-120
          hover:bg-primary/15
          active:bg-primary/20
          dark:hover:bg-primary/20
          dark:active:bg-primary/25
        `,
        outline: `
          rounded-md border-border bg-background duration-120
          hover:bg-overlay-hover hover:text-foreground
          active:bg-overlay-active
          aria-expanded:bg-overlay-hover aria-expanded:text-foreground
          dark:bg-transparent
        `,
        secondary: `
          rounded-md bg-secondary text-secondary-foreground duration-120
          hover:bg-surface-2
          active:bg-surface-3
          aria-expanded:bg-surface-2 aria-expanded:text-secondary-foreground
        `,
        ghost: `
          rounded-md duration-120
          hover:bg-overlay-hover hover:text-foreground
          active:bg-overlay-active
          aria-expanded:bg-overlay-hover aria-expanded:text-foreground
        `,
        destructive: `
          rounded-md bg-status-danger-soft text-status-danger duration-120
          hover:bg-status-danger/15
          active:bg-status-danger/20
          dark:hover:bg-status-danger/20
          dark:active:bg-status-danger/25
        `,
        link: `
          rounded-md text-primary underline-offset-4 duration-120
          hover:underline
          active:scale-100
        `,
      },
      size: {
        default: `
          h-9 gap-1.5 px-3
          has-data-[icon=inline-end]:pr-2.5
          has-data-[icon=inline-start]:pl-2.5
        `,
        xs: `
          h-6 gap-1 px-2.5 text-xs
          has-data-[icon=inline-end]:pr-2
          has-data-[icon=inline-start]:pl-2
          [&_svg:not([class*='size-'])]:size-3
        `,
        sm: `
          h-8 gap-1 px-3
          has-data-[icon=inline-end]:pr-2
          has-data-[icon=inline-start]:pl-2
        `,
        lg: `
          h-10 gap-1.5 px-4
          has-data-[icon=inline-end]:pr-3
          has-data-[icon=inline-start]:pl-3
        `,
        icon: "size-9",
        "icon-xs": `
          size-6
          [&_svg:not([class*='size-'])]:size-3
        `,
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    compoundVariants: [
      // A capsule needs horizontal room for its own curve, so the pill CTA runs
      // slightly wider than the rectangular variants at every text size.
      { variant: "default", size: "xs", className: "px-3" },
      { variant: "default", size: "sm", className: "px-3.5" },
      { variant: "default", size: "default", className: "px-4" },
      { variant: "default", size: "lg", className: "px-5" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
