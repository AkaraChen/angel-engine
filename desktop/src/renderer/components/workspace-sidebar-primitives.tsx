import type { HTMLMotionProps } from "framer-motion";
import type { ReactElement, ReactNode } from "react";
import is from "@sindresorhus/is";
import { m } from "framer-motion";

import {
  SidebarGroupLabel,
  SidebarMenuAction,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { sidebarMotion } from "@/components/workspace-sidebar-motion";
import { cn } from "@/platform/utils";

interface AnimatedSidebarMenuItemProps {
  children: ReactNode;
  className?: string;
}

export function AnimatedSidebarMenuItem({
  children,
  className,
}: AnimatedSidebarMenuItemProps): ReactElement {
  return (
    <m.li
      animate="visible"
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      exit={{ opacity: 0 }}
      layout="position"
      transition={sidebarMotion}
    >
      {children}
    </m.li>
  );
}

interface SidebarSectionHeaderProps {
  children?: ReactNode;
  label: string;
}

export function SidebarSectionHeader({
  children,
  label,
}: SidebarSectionHeaderProps): ReactElement {
  return (
    <m.div
      className="flex items-center justify-between gap-2 pr-1"
      layout
      transition={sidebarMotion}
    >
      <div className="flex min-w-0 items-center gap-1">
        <SidebarGroupLabel className="h-7">{label}</SidebarGroupLabel>
      </div>
      {!is.falsy(children) ? (
        <div
          className="
            flex items-center gap-1
            group-data-[collapsible=icon]:hidden
          "
        >
          {children}
        </div>
      ) : null}
    </m.div>
  );
}

type WorkspaceSidebarMenuButtonProps = HTMLMotionProps<"button"> & {
  isActive?: boolean;
};

export function WorkspaceSidebarMenuButton({
  children,
  className,
  isActive,
  type = "button",
  ...props
}: WorkspaceSidebarMenuButtonProps): ReactElement {
  // Pass className into SidebarMenuButton so `cn`/twMerge can drop conflicting
  // base hover text colours (e.g. hover:text-sidebar-foreground) when a CTA
  // supplies its own. Putting the override only on the asChild child lets
  // Radix Slot concatenate both class lists without merge, so base hover
  // styles can win in CSS order and turn primary-button text black on hover.
  return (
    <SidebarMenuButton
      asChild
      className={cn("relative", className)}
      isActive={isActive}
    >
      <m.button transition={sidebarMotion} type={type} {...props}>
        {children}
      </m.button>
    </SidebarMenuButton>
  );
}

type WorkspaceSidebarMenuActionProps = HTMLMotionProps<"button"> & {
  showOnHover?: boolean;
};

export function WorkspaceSidebarMenuAction({
  children,
  className,
  showOnHover,
  type = "button",
  ...props
}: WorkspaceSidebarMenuActionProps): ReactElement {
  return (
    <SidebarMenuAction asChild showOnHover={showOnHover}>
      <m.button
        className={className}
        transition={sidebarMotion}
        type={type}
        whileTap={{ scale: 0.96 }}
        {...props}
      >
        {children}
      </m.button>
    </SidebarMenuAction>
  );
}
