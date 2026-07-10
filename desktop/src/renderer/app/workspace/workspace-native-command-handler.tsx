import type { FC } from "react";

import { useEffect } from "react";
import { useSidebar } from "@/components/ui/sidebar";

interface WorkspaceNativeCommandHandlerProps {
  onCreateStandaloneChat: () => void;
  onOpenSettings: () => void;
}

export const WorkspaceNativeCommandHandler: FC<
  WorkspaceNativeCommandHandlerProps
> = ({ onCreateStandaloneChat, onOpenSettings }) => {
  const { toggleSidebar } = useSidebar();

  useEffect(
    () =>
      window.desktopWindow.onCommand((command) => {
        switch (command) {
          case "new-chat":
            onCreateStandaloneChat();
            break;
          case "open-settings":
            onOpenSettings();
            break;
          case "toggle-sidebar":
            toggleSidebar();
            break;
        }
      }),
    [onCreateStandaloneChat, onOpenSettings, toggleSidebar],
  );

  return null;
};
