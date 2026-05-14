import { motion, type HTMLMotionProps, type Transition } from "framer-motion";
import type { ReactElement, ReactNode } from "react";

import {
  SidebarGroupLabel,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { cn } from "@/platform/utils";

export const sidebarMotion = {
  duration: 0.16,
  ease: "easeOut",
} satisfies Transition;

type AnimatedSidebarMenuItemProps = {
  children: ReactNode;
  className?: string;
};

export function AnimatedSidebarMenuItem({
  children,
  className,
}: AnimatedSidebarMenuItemProps): ReactElement {
  return (
    <motion.li
      animate="visible"
      className={cn("group/menu-item relative", className)}
      data-sidebar="menu-item"
      data-slot="sidebar-menu-item"
      exit={{ opacity: 0 }}
      layout="position"
      transition={sidebarMotion}
    >
      {children}
    </motion.li>
  );
}

type SidebarSectionHeaderProps = {
  children?: ReactNode;
  label: string;
};

export function SidebarSectionHeader({
  children,
  label,
}: SidebarSectionHeaderProps): ReactElement {
  return (
    <motion.div
      className="flex items-center justify-between gap-2 pr-2"
      layout
      transition={sidebarMotion}
    >
      <div className="flex min-w-0 items-center gap-1">
        <SidebarGroupLabel className="h-7">{label}</SidebarGroupLabel>
      </div>
      {children ? (
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
          {children}
        </div>
      ) : null}
    </motion.div>
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
  return (
    <SidebarMenuButton asChild isActive={isActive}>
      <motion.button
        className={cn("relative", className)}
        transition={sidebarMotion}
        type={type}
        {...props}
      >
        {children}
      </motion.button>
    </SidebarMenuButton>
  );
}

type WorkspaceSidebarMenuSubButtonProps = HTMLMotionProps<"button"> & {
  isActive?: boolean;
};

export function WorkspaceSidebarMenuSubButton({
  children,
  className,
  isActive,
  type = "button",
  ...props
}: WorkspaceSidebarMenuSubButtonProps): ReactElement {
  return (
    <SidebarMenuSubButton asChild isActive={isActive}>
      <motion.button
        className={cn("relative", className)}
        transition={sidebarMotion}
        type={type}
        {...props}
      >
        {children}
      </motion.button>
    </SidebarMenuSubButton>
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
      <motion.button
        className={className}
        transition={sidebarMotion}
        type={type}
        whileTap={{ scale: 0.96 }}
        {...props}
      >
        {children}
      </motion.button>
    </SidebarMenuAction>
  );
}
