import type { WorkspaceGitDiffBaseKind } from "@angel-engine/daemon-api/workspace-tools";

import { useCallback, useEffect, useState } from "react";

export function useWorkspaceGitBasePreference(root: string) {
  const [baseKind, setBaseKindState] =
    useState<WorkspaceGitDiffBaseKind>("worktree");

  useEffect(() => {
    let cancelled = false;
    void window.desktopWindow.getWorkspaceDiffBase(root).then((preference) => {
      if (!cancelled && preference) {
        setBaseKindState(preference.baseKind);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [root]);

  const setBaseKind = useCallback(
    (next: WorkspaceGitDiffBaseKind) => {
      setBaseKindState(next);
      void window.desktopWindow.setWorkspaceDiffBase({ baseKind: next, root });
    },
    [root],
  );

  return { baseKind, setBaseKind };
}
