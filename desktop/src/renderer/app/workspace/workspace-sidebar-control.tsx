import type { ReactElement, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { SidebarTrigger } from "@/components/ui/sidebar";

interface WorkspaceSidebarControlPortalContextValue {
  setTarget: (target: HTMLDivElement | null) => void;
  target: HTMLDivElement | null;
}

const WorkspaceSidebarControlPortalContext =
  createContext<WorkspaceSidebarControlPortalContextValue | null>(null);

export function WorkspaceSidebarControlPortalProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);

  const value = useMemo(
    () => ({
      setTarget,
      target,
    }),
    [target],
  );

  return (
    <WorkspaceSidebarControlPortalContext.Provider value={value}>
      {children}
    </WorkspaceSidebarControlPortalContext.Provider>
  );
}

export function WorkspaceSidebarControlTarget(): ReactElement {
  const { setTarget } = useWorkspaceSidebarControlPortal();
  const isMacOS = window.desktopEnvironment.platform === "darwin";

  return (
    <div
      className="fixed z-50 flex size-8 items-center"
      ref={setTarget}
      style={{ left: isMacOS ? 80 : 20, top: 8 }}
    />
  );
}

export function WorkspaceSidebarControl(): ReactElement | null {
  const { target } = useWorkspaceSidebarControlPortal();

  if (!target) {
    return null;
  }

  return createPortal(
    <SidebarTrigger className="text-muted-foreground" />,
    target,
  );
}

function useWorkspaceSidebarControlPortal() {
  const context = useContext(WorkspaceSidebarControlPortalContext);
  if (!context) {
    throw new Error(
      "Workspace sidebar control portal must be used inside WorkspaceSidebarControlPortalProvider.",
    );
  }

  return context;
}
