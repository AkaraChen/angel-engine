import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { WorkspaceToolTabItem } from "@/app/workspace/workspace-tool-tab-model";

import {
  Plus as Add,
  Globe as Browser,
  X as Close,
  TerminalWindow as TerminalIcon,
} from "@phosphor-icons/react";
import { Fragment, useCallback, useEffect, useRef } from "react";

import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { useWorkspaceToolTabKeyboard } from "@/app/workspace/workspace-tool-tab-model";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/platform/utils";

export type WorkspaceToolTabRailOrientation = "horizontal" | "vertical";

export function WorkspaceToolTabRail({
  orientation,
}: {
  orientation: WorkspaceToolTabRailOrientation;
}) {
  const { activeTabId, closeDynamicTab, selectTab, tabItems } =
    useWorkspaceToolSurface();
  const railRef = useRef<HTMLDivElement>(null);
  const closeTab = useCallback(
    (tab: WorkspaceToolTabItem) => {
      if (tab.dynamicTab) {
        closeDynamicTab(tab.dynamicTab);
      }
    },
    [closeDynamicTab],
  );
  const { handleTabKeyDown, setTabButtonRef, tabButtonsRef } =
    useWorkspaceToolTabKeyboard({
      onCloseTab: closeTab,
      onSelectTab: selectTab,
      orientation,
      tabs: tabItems,
    });
  useEffect(() => {
    tabButtonsRef.current
      .get(activeTabId)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabButtonsRef]);
  const focusCurrentTab = useCallback(() => {
    window.requestAnimationFrame(() => {
      railRef.current
        ?.querySelector<HTMLButtonElement>('[role="tab"][tabindex="0"]')
        ?.focus();
    });
  }, []);
  const renderTab = (tab: WorkspaceToolTabItem, index: number) => (
    <WorkspaceToolTabButton
      active={tab.id === activeTabId}
      firstDynamicTab={
        orientation === "horizontal" &&
        !tab.pinned &&
        tabItems.at(index - 1)?.pinned === true
      }
      key={tab.id}
      orientation={orientation}
      setTabButtonRef={setTabButtonRef}
      tab={tab}
      onFocusCurrentTab={focusCurrentTab}
      onKeyDown={handleTabKeyDown}
    />
  );

  if (orientation === "horizontal") {
    return (
      <div
        className="flex h-10 shrink-0 items-center gap-1 px-2 pt-2 pb-1"
        ref={railRef}
      >
        <div
          aria-label="Workspace tabs"
          className="
            flex min-w-0 items-center gap-px overflow-x-auto rounded-md
            bg-surface-1 p-0.5
            [&::-webkit-scrollbar]:hidden
          "
          role="tablist"
        >
          {tabItems.map(renderTab)}
        </div>
        <WorkspaceToolNewTabMenu />
      </div>
    );
  }

  const pinnedTabs = tabItems.filter((tab) => tab.pinned);
  const dynamicTabs = tabItems.filter((tab) => !tab.pinned);

  return (
    <div
      aria-label="Workspace tabs"
      aria-orientation="vertical"
      className="flex min-h-0 flex-1 flex-col overflow-y-auto p-2"
      ref={railRef}
      role="tablist"
    >
      <div
        className="
          mb-1 flex h-6 shrink-0 items-center pl-2 text-xs font-medium
          tracking-wide text-muted-foreground
        "
        role="presentation"
      >
        Tools
      </div>
      <div className="flex flex-col gap-0.5" role="presentation">
        {pinnedTabs.map((tab) => renderTab(tab, tabItems.indexOf(tab)))}
      </div>
      <div
        className="
          mt-3 mb-1 flex h-6 shrink-0 items-center justify-between pl-2
        "
        role="presentation"
      >
        <span className="text-xs font-medium tracking-wide text-muted-foreground">
          Tabs
        </span>
        <WorkspaceToolNewTabMenu variant="section" />
      </div>
      <div className="flex flex-col gap-0.5" role="presentation">
        {dynamicTabs.map((tab) => renderTab(tab, tabItems.indexOf(tab)))}
      </div>
    </div>
  );
}

function WorkspaceToolTabButton({
  active,
  firstDynamicTab,
  onFocusCurrentTab,
  onKeyDown,
  orientation,
  setTabButtonRef,
  tab,
}: {
  active: boolean;
  firstDynamicTab: boolean;
  onFocusCurrentTab: () => void;
  onKeyDown: (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tabId: string,
  ) => void;
  orientation: WorkspaceToolTabRailOrientation;
  setTabButtonRef: (tabId: string, button: HTMLButtonElement | null) => void;
  tab: WorkspaceToolTabItem;
}) {
  const { closeDynamicTab, selectTab } = useWorkspaceToolSurface();
  const Icon = tab.icon;
  const dynamicTab = tab.dynamicTab;
  const horizontal = orientation === "horizontal";
  const showClose = dynamicTab !== undefined && (horizontal ? active : true);
  const closeButton = showClose ? (
    <button
      aria-label={`Close ${tab.title}`}
      className={cn(
        `
          mr-1 flex shrink-0 items-center justify-center rounded-sm
          text-muted-foreground/70 outline-none
          hover:bg-overlay-hover hover:text-foreground
          focus-visible:ring-2 focus-visible:ring-ring/50
          focus-visible:ring-inset
          active:bg-overlay-active
        `,
        horizontal
          ? "size-4.5"
          : `
            size-5 transition-opacity
            group-focus-within:opacity-100
            group-hover:opacity-100
            motion-reduce:transition-none
          `,
        !horizontal && (active ? "opacity-100" : "opacity-0"),
      )}
      onClick={(event) => {
        event.stopPropagation();
        if (dynamicTab) {
          closeDynamicTab(dynamicTab);
        }
        onFocusCurrentTab();
      }}
      tabIndex={horizontal || active ? 0 : -1}
      title={`Close ${tab.title}`}
      type="button"
    >
      <Close className="size-3.5" />
    </button>
  ) : null;

  return (
    <Fragment>
      {firstDynamicTab ? (
        <div
          aria-hidden="true"
          className="mx-0.5 h-4 w-px shrink-0 bg-border-subtle"
        />
      ) : null}
      <div
        className={cn(
          `
            group flex shrink-0 items-center overflow-hidden
            text-muted-foreground
          `,
          horizontal ? "h-6 rounded-sm" : "h-8 min-w-0 rounded-md text-xs",
          active
            ? cn(
                "text-foreground shadow-xs",
                horizontal ? "bg-card" : "bg-background",
              )
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
          className={cn(
            `
              flex h-full items-center outline-none
              focus-visible:ring-2 focus-visible:ring-ring/50
              focus-visible:ring-inset
            `,
            horizontal
              ? "w-6 shrink-0 justify-center"
              : "min-w-0 flex-1 gap-2 pl-2 text-left",
          )}
          id={`workspace-tool-tab-${tab.id}`}
          onAuxClick={(event) => {
            if (event.button === 1 && dynamicTab) {
              event.preventDefault();
              closeDynamicTab(dynamicTab);
            }
          }}
          onClick={() => {
            void selectTab(tab.id);
          }}
          onKeyDown={(event) => onKeyDown(event, tab.id)}
          ref={(button) => setTabButtonRef(tab.id, button)}
          role="tab"
          tabIndex={active ? 0 : -1}
          title={tab.title}
          type="button"
        >
          <Icon
            className={cn("shrink-0", horizontal ? "size-4" : "size-3.5")}
            weight="duotone"
          />
          {horizontal ? null : <span className="truncate">{tab.title}</span>}
        </button>
        {closeButton}
      </div>
    </Fragment>
  );
}

function WorkspaceToolNewTabMenu({
  variant = "strip",
}: {
  variant?: "section" | "strip";
}) {
  const { addBrowserTab, addTerminalTab } = useWorkspaceToolSurface();

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
        <DropdownMenuItem onSelect={addTerminalTab}>
          <TerminalIcon className="size-3.5" weight="duotone" />
          <span>Terminal</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={addBrowserTab}>
          <Browser className="size-3.5" weight="duotone" />
          <span>Browser</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
