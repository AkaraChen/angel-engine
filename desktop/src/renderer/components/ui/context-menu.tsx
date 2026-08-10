import {
  Check as CheckIcon,
  CaretRight as ChevronRightIcon,
} from "@phosphor-icons/react";
import { ContextMenu as ContextMenuPrimitive } from "radix-ui";

import * as React from "react";
import { cn } from "@/platform/utils";

type ContextMenuContentVariant = "default" | "apple" | "native";

const contextMenuContentVariants: Record<ContextMenuContentVariant, string> = {
  apple:
    "rounded-lg border border-white/[0.55] bg-white/80 bg-clip-padding shadow-[0_18px_45px_-28px_rgba(0,0,0,0.78),0_1px_0_rgba(255,255,255,0.95)_inset] backdrop-blur-2xl backdrop-saturate-150 supports-backdrop-filter:bg-white/[0.72] dark:border-white/[0.12] dark:bg-card/90 dark:shadow-[0_18px_45px_-28px_rgba(0,0,0,0.95),0_1px_0_rgba(255,255,255,0.08)_inset] dark:supports-backdrop-filter:bg-card/82",
  default: "rounded-lg bg-popover shadow-popover ring-1 ring-border-subtle",
  native:
    "rounded-md border border-black/10 bg-white/90 bg-clip-padding shadow-[0_12px_30px_-24px_rgba(0,0,0,0.72),0_1px_0_rgba(255,255,255,0.82)_inset] backdrop-blur-xl backdrop-saturate-150 dark:border-white/[0.12] dark:bg-card/95 dark:shadow-[0_12px_30px_-24px_rgba(0,0,0,0.9),0_1px_0_rgba(255,255,255,0.06)_inset]",
};

function ContextMenu({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />;
}

function ContextMenuPortal({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
  );
}

function ContextMenuTrigger({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  );
}

function ContextMenuContent({
  className,
  variant = "native",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content> & {
  variant?: ContextMenuContentVariant;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        className={cn(
          `
            z-50 max-h-(--radix-context-menu-content-available-height) min-w-44
            origin-(--radix-context-menu-content-transform-origin)
            overflow-x-hidden overflow-y-auto p-1.5 text-popover-foreground
            duration-150 ease-standard
            data-[side=bottom]:slide-in-from-top-1
            data-[side=left]:slide-in-from-right-1
            data-[side=right]:slide-in-from-left-1
            data-[side=top]:slide-in-from-bottom-1
            data-[state=closed]:overflow-hidden
            data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95
            data-closed:animate-out data-closed:duration-100
            data-closed:fade-out-0 data-closed:zoom-out-95
            motion-reduce:transition-none motion-reduce:animate-none
          `,
          contextMenuContentVariants[variant],
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

function ContextMenuGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return (
    <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
  );
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        `
          group/context-menu-item relative flex min-h-8 cursor-default
          items-center gap-2 rounded-sm px-2.5 py-1.5 text-[13px] font-normal
          outline-hidden select-none
          focus:bg-overlay-hover focus:text-foreground
          not-data-[variant=destructive]:focus:**:text-foreground
          data-inset:pl-8
          data-[variant=destructive]:text-destructive
          data-[variant=destructive]:focus:bg-destructive/10
          data-[variant=destructive]:focus:text-destructive
          dark:data-[variant=destructive]:focus:bg-destructive/20
          data-disabled:pointer-events-none data-disabled:opacity-50
          [&_svg]:pointer-events-none [&_svg]:shrink-0
          [&_svg:not([class*='size-'])]:size-3.5
          data-[variant=destructive]:*:[svg]:text-destructive
        `,
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & {
  inset?: boolean;
}) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        `
          relative flex min-h-8 cursor-default items-center gap-2 rounded-sm
          py-1.5 pr-8 pl-2.5 text-[13px] font-normal outline-hidden select-none
          focus:bg-overlay-hover focus:text-foreground
          focus:**:text-foreground
          data-[state=checked]:bg-primary-soft
          data-[state=checked]:text-primary-soft-foreground
          data-inset:pl-8
          data-disabled:pointer-events-none data-disabled:opacity-50
          [&_svg]:pointer-events-none [&_svg]:shrink-0
          [&_svg:not([class*='size-'])]:size-3.5
        `,
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="
          pointer-events-none absolute right-2 flex items-center justify-center
        "
        data-slot="context-menu-checkbox-item-indicator"
      >
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

function ContextMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
  return (
    <ContextMenuPrimitive.RadioGroup
      data-slot="context-menu-radio-group"
      {...props}
    />
  );
}

function ContextMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem> & {
  inset?: boolean;
}) {
  return (
    <ContextMenuPrimitive.RadioItem
      data-slot="context-menu-radio-item"
      data-inset={inset}
      className={cn(
        `
          relative flex min-h-8 cursor-default items-center gap-2 rounded-sm
          py-1.5 pr-8 pl-2.5 text-[13px] font-normal outline-hidden select-none
          focus:bg-overlay-hover focus:text-foreground
          focus:**:text-foreground
          data-[state=checked]:bg-primary-soft
          data-[state=checked]:text-primary-soft-foreground
          data-inset:pl-8
          data-disabled:pointer-events-none data-disabled:opacity-50
          [&_svg]:pointer-events-none [&_svg]:shrink-0
          [&_svg:not([class*='size-'])]:size-3.5
        `,
        className,
      )}
      {...props}
    >
      <span
        className="
          pointer-events-none absolute right-2 flex items-center justify-center
        "
        data-slot="context-menu-radio-item-indicator"
      >
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

function ContextMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        `
          px-2.5 py-1.5 font-mono text-[0.6875rem] font-medium tracking-wide
          text-muted-foreground uppercase
          data-inset:pl-8
        `,
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border-subtle", className)}
      {...props}
    />
  );
}

function ContextMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn(
        `
          ml-auto text-[11px] tracking-normal text-muted-foreground
          group-focus/context-menu-item:text-foreground
        `,
        className,
      )}
      {...props}
    />
  );
}

function ContextMenuSub({
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />;
}

function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        `
          flex min-h-8 cursor-default items-center gap-2 rounded-sm px-2.5
          py-1.5 text-[13px] font-normal outline-hidden select-none
          focus:bg-overlay-hover focus:text-foreground
          not-data-[variant=destructive]:focus:**:text-foreground
          data-inset:pl-8
          data-open:bg-overlay-hover data-open:text-foreground
          [&_svg]:pointer-events-none [&_svg]:shrink-0
          [&_svg:not([class*='size-'])]:size-3.5
        `,
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto opacity-55" />
    </ContextMenuPrimitive.SubTrigger>
  );
}

function ContextMenuSubContent({
  className,
  variant = "native",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubContent> & {
  variant?: ContextMenuContentVariant;
}) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.SubContent
        data-slot="context-menu-sub-content"
        className={cn(
          `
            z-50 min-w-40
            origin-(--radix-context-menu-content-transform-origin)
            overflow-x-hidden overflow-y-auto p-1.5 text-popover-foreground
            duration-150 ease-standard
            data-[side=bottom]:slide-in-from-top-1
            data-[side=left]:slide-in-from-right-1
            data-[side=right]:slide-in-from-left-1
            data-[side=top]:slide-in-from-bottom-1
            data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95
            data-closed:animate-out data-closed:duration-100
            data-closed:fade-out-0 data-closed:zoom-out-95
            motion-reduce:transition-none motion-reduce:animate-none
          `,
          contextMenuContentVariants[variant],
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
}

export {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuPortal,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
};
