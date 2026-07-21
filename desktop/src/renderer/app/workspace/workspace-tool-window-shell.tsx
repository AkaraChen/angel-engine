import { SidebarSimple as DockIcon } from "@phosphor-icons/react";
import is from "@sindresorhus/is";

import { WorkspaceToolContent } from "@/app/workspace/workspace-tool-content";
import { WorkspaceToolEmpty } from "@/app/workspace/workspace-tool-layout";
import { WorkspaceToolHeaderButton } from "@/app/workspace/workspace-tool-surface-header";
import { useWorkspaceToolSurface } from "@/app/workspace/workspace-tool-surface-model";
import { WorkspaceToolTabRail } from "@/app/workspace/workspace-tool-tab-navigation";

export function WorkspaceToolWindowShell({
  root,
  trafficLightInset,
}: {
  root: string | null;
  trafficLightInset: boolean;
}) {
  const { activeTabId, requestSurfaceHost } = useWorkspaceToolSurface();

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <aside
        className="
          flex w-56 shrink-0 flex-col border-r border-border-subtle
          bg-surface-1
        "
      >
        {trafficLightInset ? (
          <div className="h-12 shrink-0" data-electron-drag />
        ) : null}
        <WorkspaceToolTabRail orientation="vertical" />
        <div
          className="
            flex h-11 shrink-0 items-center justify-end border-t
            border-border-subtle px-2
          "
        >
          <WorkspaceToolHeaderButton
            icon={<DockIcon weight="duotone" />}
            label="Dock in sidebar"
            onClick={() => {
              void requestSurfaceHost("sidebar");
            }}
          />
        </div>
      </aside>
      <main
        aria-labelledby={`workspace-tool-tab-${activeTabId}`}
        className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
        id="workspace-tool-panel"
        role="tabpanel"
      >
        {is.nonEmptyString(root) ? (
          <WorkspaceToolContent root={root} />
        ) : (
          <WorkspaceToolEmpty title="No workspace for this chat" />
        )}
      </main>
    </div>
  );
}
