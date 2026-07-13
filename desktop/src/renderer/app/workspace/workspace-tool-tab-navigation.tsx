import type { WorkspaceToolSurfaceDynamicTab } from "@shared/workspace-tool-surface";
import type {
  WorkspaceToolTabItem,
  WorkspaceToolTabSelectHandler,
} from "@/app/workspace/workspace-tool-tab-model";

import {
  Plus as Add,
  Globe as Browser,
  X as Close,
  TerminalWindow as TerminalIcon,
} from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/platform/utils";
import { useWorkspaceToolTabKeyboard } from "@/app/workspace/workspace-tool-tab-model";

export function WorkspaceToolTabStrip({
  activeTabId,
  tabs,
  onAddBrowserTab,
  onAddTerminalTab,
  onCloseDynamicTab,
  onSelectTab,
}: {
  activeTabId: string;
  tabs: WorkspaceToolTabItem[];
  onAddBrowserTab: () => void;
  onAddTerminalTab: () => void;
  onCloseDynamicTab: (tab: WorkspaceToolSurfaceDynamicTab) => void;
  onSelectTab: WorkspaceToolTabSelectHandler;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const closeTab = useCallback(
    (tab: WorkspaceToolTabItem) => {
      if (tab.dynamicTab) {
        onCloseDynamicTab(tab.dynamicTab);
      }
    },
    [onCloseDynamicTab],
  );
  const { handleTabKeyDown, setTabButtonRef, tabButtonsRef } =
    useWorkspaceToolTabKeyboard({
      onCloseTab: closeTab,
      onSelectTab,
      orientation: "horizontal",
      tabs,
    });
  useEffect(() => {
    tabButtonsRef.current
      .get(activeTabId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabButtonsRef]);

  return (
    <div
      className="
        flex h-9 shrink-0 items-center gap-1 border-b border-border-subtle
        px-1.5
      "
      ref={stripRef}
    >
      <div
        aria-label="Workspace tabs"
        className="
          flex min-w-0 items-center gap-0.5 overflow-x-auto
          [&::-webkit-scrollbar]:hidden
        "
        role="tablist"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeTabId;
          const Icon = tab.icon;
          const dynamicTab = tab.dynamicTab;
          const firstDynamicTab =
            !tab.pinned && tabs.at(index - 1)?.pinned === true;

          return (
            <Fragment key={tab.id}>
              {firstDynamicTab ? (
                <div
                  aria-hidden="true"
                  className="mx-0.5 h-4 w-px shrink-0 bg-border-subtle"
                />
              ) : null}
              <div
                className={cn(
                  `
                    flex h-7 shrink-0 items-center overflow-hidden rounded-md
                    text-muted-foreground
                  `,
                  active
                    ? "bg-surface-1 text-foreground shadow-xs"
                    : `
                      hover:bg-overlay-hover hover:text-foreground
                      active:bg-overlay-active
                    `,
                )}
                role="presentation"
              >
                <button
                  aria-controls="workspace-tool-panel"
                  aria-selected={active}
                  className="
                    flex h-full w-7 shrink-0 items-center justify-center
                    outline-none
                    focus-visible:ring-2 focus-visible:ring-ring/50
                    focus-visible:ring-inset
                  "
                  id={`workspace-tool-tab-${tab.id}`}
                  onAuxClick={(event) => {
                    if (event.button === 1 && dynamicTab) {
                      event.preventDefault();
                      onCloseDynamicTab(dynamicTab);
                    }
                  }}
                  onClick={() => {
                    void onSelectTab(tab.id);
                  }}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                  ref={(button) => setTabButtonRef(tab.id, button)}
                  role="tab"
                  tabIndex={active ? 0 : -1}
                  title={tab.title}
                  type="button"
                >
                  <Icon className="size-3.5 shrink-0" weight="duotone" />
                </button>
                {dynamicTab && active ? (
                  <button
                    aria-label={`Close ${tab.title}`}
                    className="
                      mr-1 flex size-4.5 shrink-0 items-center justify-center
                      rounded-sm text-muted-foreground/70 outline-none
                      hover:bg-overlay-hover hover:text-foreground
                      focus-visible:ring-2 focus-visible:ring-ring/50
                      focus-visible:ring-inset
                      active:bg-overlay-active
                    "
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseDynamicTab(dynamicTab);
                      window.requestAnimationFrame(() => {
                        stripRef.current
                          ?.querySelector<HTMLButtonElement>(
                            '[role="tab"][tabindex="0"]',
                          )
                          ?.focus();
                      });
                    }}
                    title={`Close ${tab.title}`}
                    type="button"
                  >
                    <Close className="size-3.5" />
                  </button>
                ) : null}
              </div>
            </Fragment>
          );
        })}
      </div>
      <WorkspaceToolNewTabMenu
        onAddBrowserTab={onAddBrowserTab}
        onAddTerminalTab={onAddTerminalTab}
      />
    </div>
  );
}

export function WorkspaceToolVerticalTabSidebar({
  activeTabId,
  tabs,
  onAddBrowserTab,
  onAddTerminalTab,
  onCloseDynamicTab,
  onSelectTab,
}: {
  activeTabId: string;
  tabs: WorkspaceToolTabItem[];
  onAddBrowserTab: () => void;
  onAddTerminalTab: () => void;
  onCloseDynamicTab: (tab: WorkspaceToolSurfaceDynamicTab) => void;
  onSelectTab: WorkspaceToolTabSelectHandler;
}) {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const closeTab = useCallback(
    (tab: WorkspaceToolTabItem) => {
      if (tab.dynamicTab) {
        onCloseDynamicTab(tab.dynamicTab);
      }
    },
    [onCloseDynamicTab],
  );
  const { handleTabKeyDown, setTabButtonRef, tabButtonsRef } =
    useWorkspaceToolTabKeyboard({
      onCloseTab: closeTab,
      onSelectTab,
      orientation: "vertical",
      tabs,
    });
  useEffect(() => {
    tabButtonsRef.current
      .get(activeTabId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabButtonsRef]);

  const renderTab = (tab: WorkspaceToolTabItem) => {
    const active = tab.id === activeTabId;
    const Icon = tab.icon;
    const dynamicTab = tab.dynamicTab;

    return (
      <div
        className={cn(
          `
            group flex h-8 min-w-0 shrink-0 items-center overflow-hidden
            rounded-md text-xs text-muted-foreground
          `,
          active
            ? "bg-background text-foreground shadow-xs"
            : `
              hover:bg-overlay-hover hover:text-foreground
              active:bg-overlay-active
            `,
        )}
        key={tab.id}
        role="presentation"
      >
        <button
          aria-controls="workspace-tool-panel"
          aria-selected={active}
          className="
            flex h-full min-w-0 flex-1 items-center gap-2 pl-2 text-left
            outline-none
            focus-visible:ring-2 focus-visible:ring-ring/50
            focus-visible:ring-inset
          "
          id={`workspace-tool-tab-${tab.id}`}
          onAuxClick={(event) => {
            if (event.button === 1 && dynamicTab) {
              event.preventDefault();
              onCloseDynamicTab(dynamicTab);
            }
          }}
          onClick={() => {
            void onSelectTab(tab.id);
          }}
          onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
          ref={(button) => setTabButtonRef(tab.id, button)}
          role="tab"
          tabIndex={active ? 0 : -1}
          title={tab.title}
          type="button"
        >
          <Icon className="size-3.5 shrink-0" weight="duotone" />
          <span className="truncate">{tab.title}</span>
        </button>
        {dynamicTab ? (
          <button
            aria-label={`Close ${tab.title}`}
            className={cn(
              `
                mr-1 flex size-5 shrink-0 items-center justify-center rounded-sm
                text-muted-foreground/70 transition-opacity outline-none
                group-focus-within:opacity-100
                group-hover:opacity-100
                hover:bg-overlay-hover hover:text-foreground
                focus-visible:ring-2 focus-visible:ring-ring/50
                focus-visible:ring-inset
                active:bg-overlay-active
                motion-reduce:transition-none
              `,
              active ? "opacity-100" : "opacity-0",
            )}
            onClick={(event) => {
              event.stopPropagation();
              onCloseDynamicTab(dynamicTab);
              window.requestAnimationFrame(() => {
                sidebarRef.current
                  ?.querySelector<HTMLButtonElement>(
                    '[role="tab"][tabindex="0"]',
                  )
                  ?.focus();
              });
            }}
            tabIndex={active ? 0 : -1}
            title={`Close ${tab.title}`}
            type="button"
          >
            <Close className="size-3.5" />
          </button>
        ) : null}
      </div>
    );
  };
  const pinnedTabs = tabs.filter((tab) => tab.pinned);
  const dynamicTabs = tabs.filter((tab) => !tab.pinned);

  return (
    <div
      className="
        flex w-56 shrink-0 flex-col border-r border-border-subtle bg-surface-1
      "
      ref={sidebarRef}
    >
      <div
        aria-label="Workspace tabs"
        aria-orientation="vertical"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2"
        role="tablist"
      >
        <div className="flex flex-col gap-0.5" role="presentation">
          {pinnedTabs.map(renderTab)}
        </div>
        <div
          className="
            mt-3 mb-1 flex h-6 shrink-0 items-center justify-between pl-2
          "
          role="presentation"
        >
          <span className="text-xs font-medium text-muted-foreground">
            Tabs
          </span>
          <WorkspaceToolNewTabMenu
            variant="section"
            onAddBrowserTab={onAddBrowserTab}
            onAddTerminalTab={onAddTerminalTab}
          />
        </div>
        <div className="flex flex-col gap-0.5" role="presentation">
          {dynamicTabs.map(renderTab)}
        </div>
      </div>
    </div>
  );
}

function WorkspaceToolNewTabMenu({
  onAddBrowserTab,
  onAddTerminalTab,
  variant = "strip",
}: {
  onAddBrowserTab: () => void;
  onAddTerminalTab: () => void;
  variant?: "section" | "strip";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="New tab"
          className={cn(
            `
              text-muted-foreground
              hover:bg-overlay-hover
              active:bg-overlay-active
            `,
            variant === "section"
              ? "size-6 rounded-sm"
              : "size-7 shrink-0 rounded-md",
          )}
          size="icon-xs"
          title="New tab"
          type="button"
          variant="ghost"
        >
          <Add className="size-3.5" weight="regular" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" variant="native">
        <DropdownMenuItem onSelect={onAddTerminalTab}>
          <TerminalIcon className="size-3.5" weight="duotone" />
          <span>Terminal</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onAddBrowserTab}>
          <Browser className="size-3.5" weight="duotone" />
          <span>Browser</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
