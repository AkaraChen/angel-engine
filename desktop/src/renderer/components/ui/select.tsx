"use client";

import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import * as React from "react";
import { Select as SelectPrimitive } from "radix-ui";

import { cn } from "@/platform/utils";

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      className={cn("scroll-my-1 p-1", className)}
      data-slot="select-group"
      {...props}
    />
  );
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default";
}) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        `
          flex w-fit min-w-0 items-center justify-between gap-1.5 rounded-md
          border border-input bg-card px-3 py-1 text-sm whitespace-nowrap
          transition-[color,box-shadow,background-color,border-color]
          duration-150 ease-standard outline-none select-none
          focus-visible:border-primary focus-visible:ring-2
          focus-visible:ring-ring/45 disabled:pointer-events-none
          disabled:cursor-not-allowed disabled:opacity-50
          data-placeholder:text-muted-foreground aria-invalid:border-destructive
          aria-invalid:ring-3 aria-invalid:ring-destructive/20
          data-[size=default]:h-9 data-[size=sm]:h-8
          motion-reduce:transition-none dark:bg-surface-1
          dark:aria-invalid:border-destructive/50
          dark:aria-invalid:ring-destructive/40
          *:data-[slot=select-value]:line-clamp-1
          *:data-[slot=select-value]:flex
          *:data-[slot=select-value]:items-center
          *:data-[slot=select-value]:gap-1.5
          [&_svg]:pointer-events-none [&_svg]:shrink-0
          [&_svg:not([class*='size-'])]:size-4
        `,
        className,
      )}
      data-size={size}
      data-slot="select-trigger"
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <CaretDown className="pointer-events-none size-4 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        align={align}
        className={cn(
          `
            relative z-50 max-h-(--radix-select-content-available-height)
            min-w-36 origin-(--radix-select-content-transform-origin)
            overflow-x-hidden overflow-y-auto rounded-md bg-popover/92
            text-popover-foreground shadow-md ring-1 ring-foreground/10
            backdrop-blur-xl duration-100 data-closed:animate-out
            data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in
            data-open:fade-in-0 data-open:zoom-in-95
            data-[align-trigger=true]:animate-none
            data-[side=bottom]:slide-in-from-top-2
            data-[side=left]:slide-in-from-right-2
            data-[side=right]:slide-in-from-left-2
            data-[side=top]:slide-in-from-bottom-2
          `,
          position === "popper" &&
            `
              data-[side=bottom]:translate-y-1
              data-[side=left]:-translate-x-1
              data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1
            `,
          className,
        )}
        data-align-trigger={position === "item-aligned"}
        data-slot="select-content"
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className="data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)"
          data-position={position}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn("px-1.5 py-1 text-xs text-muted-foreground", className)}
      data-slot="select-label"
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        `
          relative flex w-full cursor-default items-center gap-1.5 rounded-sm
          py-1.5 pr-8 pl-2 text-sm outline-hidden select-none
          focus:bg-accent focus:text-accent-foreground
          data-disabled:pointer-events-none data-disabled:opacity-50
          [&_svg]:pointer-events-none [&_svg]:shrink-0
          [&_svg:not([class*='size-'])]:size-4
        `,
        className,
      )}
      data-slot="select-item"
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      data-slot="select-separator"
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1",
        className,
      )}
      data-slot="select-scroll-up-button"
      {...props}
    >
      <CaretUp />
    </SelectPrimitive.ScrollUpButton>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1",
        className,
      )}
      data-slot="select-scroll-down-button"
      {...props}
    >
      <CaretDown />
    </SelectPrimitive.ScrollDownButton>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
