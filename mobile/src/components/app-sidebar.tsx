import type { Icon } from "@phosphor-icons/react";
import type { ParseKeys } from "i18next";

import { GearSix, House, Sparkle, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { Link, useRoute } from "wouter";

import { DaemonStatus } from "@/components/daemon-status";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  labelKey: ParseKeys;
  icon: Icon;
  match: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "sidebar.home", icon: House, match: "/" },
  {
    href: "/settings",
    labelKey: "common.settings",
    icon: GearSix,
    match: "/settings",
  },
];

export function AppSidebar() {
  const { t } = useTranslation();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar
      mobileDescription={t("sidebar.navigationDescription")}
      mobileTitle={t("sidebar.navigationTitle")}
    >
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Sparkle className="text-primary" size={22} weight="fill" />
          <span className="min-w-0 flex-1 font-heading text-base font-semibold">
            Angel Engine
          </span>
          {/* Visible 44px close for the mobile sheet; desktop rail stays open. */}
          <Button
            aria-label={t("sidebar.close")}
            className="size-11 shrink-0 md:hidden"
            onClick={() => setOpenMobile(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X size={20} weight="bold" />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <NavMenuItem key={item.href} item={item} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <DaemonStatus />
      </SidebarFooter>
    </Sidebar>
  );
}

function NavMenuItem({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const [isActive] = useRoute(item.match);
  const { setOpenMobile } = useSidebar();
  const Icon = item.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={item.href} onClick={() => setOpenMobile(false)}>
          <Icon size={18} weight={isActive ? "fill" : "regular"} />
          <span>{t(item.labelKey)}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
