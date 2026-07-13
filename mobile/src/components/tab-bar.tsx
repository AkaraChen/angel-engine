import type { Icon } from "@phosphor-icons/react";

import { GearSix, House } from "@phosphor-icons/react";
import { Link, useRoute } from "wouter";

import { cn } from "@/lib/utils";

interface TabItem {
  href: string;
  label: string;
  icon: Icon;
  match: string;
}

const TABS: TabItem[] = [
  { href: "/", label: "Home", icon: House, match: "/" },
  { href: "/settings", label: "Settings", icon: GearSix, match: "/settings" },
];

export function TabBar() {
  return (
    <nav
      className="
        flex shrink-0 items-stretch border-t border-border bg-background/95
        pb-[env(safe-area-inset-bottom)] backdrop-blur-sm
      "
    >
      {TABS.map((tab) => (
        <TabBarItem key={tab.href} tab={tab} />
      ))}
    </nav>
  );
}

function TabBarItem({ tab }: { tab: TabItem }) {
  const [isActive] = useRoute(tab.match);
  const Icon = tab.icon;
  return (
    <Link
      className={cn(
        `
          flex flex-1 flex-col items-center justify-center gap-1 py-2 text-xs
          font-medium
        `,
        isActive ? "text-foreground" : "text-muted-foreground",
      )}
      href={tab.href}
    >
      <Icon size={22} weight={isActive ? "fill" : "regular"} />
      {tab.label}
    </Link>
  );
}
