import type { WorkspaceFileReadResult } from "@angel-engine/daemon-api/workspace-tools";
import type { QueryClient } from "@tanstack/react-query";
import type { ApiClient } from "@/platform/api-client";

import is from "@sindresorhus/is";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  isWorkspaceWindowFileStateDirty,
  useWorkspaceToolStore,
} from "@/app/workspace/workspace-tool-store";
import { queryKeys } from "@/platform/query-keys";

export function useWorkspaceWindowFileOpener(api: ApiClient) {
  const queryClient = useQueryClient();
  const openWindowFile = useWorkspaceToolStore((state) => state.openWindowFile);
  const setWindowFileReadError = useWorkspaceToolStore(
    (state) => state.setWindowFileReadError,
  );
  const setWindowFileReadResult = useWorkspaceToolStore(
    (state) => state.setWindowFileReadResult,
  );

  return useCallback(
    ({ path, root }: { path: string; root: string }) => {
      const fileStates =
        useWorkspaceToolStore.getState().windowFilesByRoot[root]?.fileStates;
      const currentState =
        fileStates !== undefined && Object.hasOwn(fileStates, path)
          ? fileStates[path]
          : undefined;

      openWindowFile({ path, root });
      if (currentState !== undefined && currentState.status !== "error") {
        return;
      }

      void queryClient
        .fetchQuery({
          queryFn: async () => api.workspaceTools.readFile({ path, root }),
          queryKey: queryKeys.workspaceTools.readFile(root, path),
          retry: false,
          staleTime: 5_000,
        })
        .then((result) => {
          setWindowFileReadResult({ result, root });
        })
        .catch((error: unknown) => {
          setWindowFileReadError({
            message: getErrorMessage(error),
            path,
            root,
          });
        });
    },
    [
      api,
      openWindowFile,
      queryClient,
      setWindowFileReadError,
      setWindowFileReadResult,
    ],
  );
}

export async function confirmWorkspaceWindowFilesExit({
  api,
  queryClient,
  root,
}: {
  api: ApiClient;
  queryClient: QueryClient;
  root: string | null;
}) {
  if (!is.nonEmptyString(root)) {
    return true;
  }

  let didWriteFile = false;
  for (const path of getDirtyWorkspaceWindowFilePaths(root)) {
    const state =
      useWorkspaceToolStore.getState().windowFilesByRoot[root]?.fileStates[
        path
      ];
    if (!isWorkspaceWindowFileStateDirty(state) || state.status !== "text") {
      continue;
    }

    const action = await window.desktopWindow.confirmSaveWorkspaceFileChanges({
      path,
    });
    if (action === "cancel") {
      return false;
    }
    if (action === "discard") {
      useWorkspaceToolStore.getState().setWindowFileDraftContent({
        content: state.savedContent,
        path,
        root,
      });
      continue;
    }

    try {
      const result = await api.workspaceTools.writeFile({
        content: state.draftContent,
        path,
        root,
      });
      didWriteFile = true;
      useWorkspaceToolStore.getState().setWindowFileSavedContent({
        content: state.draftContent,
        path,
        root,
        size: result.size,
      });
      queryClient.setQueryData(queryKeys.workspaceTools.readFile(root, path), {
        content: state.draftContent,
        path,
        root,
        size: result.size,
        type: "text",
      } satisfies WorkspaceFileReadResult);
    } catch (error: unknown) {
      console.error("Failed to save workspace file before leaving editor.", {
        error,
        path,
        root,
      });
      return false;
    }
  }

  if (didWriteFile) {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.fileTree(root),
    });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.workspaceTools.gitDiff(root),
    });
  }

  if (getDirtyWorkspaceWindowFilePaths(root).length === 0) {
    useWorkspaceToolStore.getState().setWindowFilesEditorDirty(false);
  }
  return true;
}

function getDirtyWorkspaceWindowFilePaths(root: string) {
  const windowFilesByRoot = useWorkspaceToolStore.getState().windowFilesByRoot;
  if (!Object.hasOwn(windowFilesByRoot, root)) {
    return [];
  }
  const windowFilesState = windowFilesByRoot[root];

  return windowFilesState.openFilePaths.filter((path) =>
    isWorkspaceWindowFileStateDirty(windowFilesState.fileStates[path]),
  );
}
