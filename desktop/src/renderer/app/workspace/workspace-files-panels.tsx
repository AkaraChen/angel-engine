import type { WorkspaceFileReadResult } from "@shared/workspace-tools";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { ApiClient } from "@/platform/api-client";

import { FileTree } from "@pierre/trees/react";
import is from "@sindresorhus/is";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { getErrorMessage } from "@/app/workspace/workspace-file-display";
import {
  getFileTreePathFromEvent,
  treeHostStyle,
  useWorkspaceFileTreeModel,
} from "@/app/workspace/workspace-file-tree";
import { WorkspaceWindowFileEditor } from "@/app/workspace/workspace-file-editor";
import {
  initialWorkspaceToolFileTreeWidth,
  WorkspaceToolEmpty,
  WorkspaceToolPanelSplitter,
  workspaceToolFileTreeWidthMax,
  workspaceToolFileTreeWidthMin,
  workspaceToolFileTreeWidthStorageKey,
} from "@/app/workspace/workspace-tool-layout";
import {
  emptyWorkspaceWindowFilesState,
  isWorkspaceWindowFileStateDirty,
  useWorkspaceToolStore,
} from "@/app/workspace/workspace-tool-store";
import { useWorkspaceWindowFileOpener } from "@/app/workspace/workspace-window-file-state";
import { queryKeys } from "@/platform/query-keys";

export function WorkspaceFilesPanel({
  api,
  onOpenFile,
  root,
}: {
  api: ApiClient;
  onOpenFile: (path: string) => void;
  root: string;
}) {
  const { model, treeQuery } = useWorkspaceFileTreeModel(api, root);
  const handleFileTreeClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const path = getFileTreePathFromEvent(event);
      if (is.nonEmptyString(path)) {
        onOpenFile(path);
      }
    },
    [onOpenFile],
  );
  const handleFileTreeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const path = getFileTreePathFromEvent(event);
      if (!is.nonEmptyString(path)) {
        return;
      }
      event.preventDefault();
      onOpenFile(path);
    },
    [onOpenFile],
  );

  if (treeQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(treeQuery.error)}
        title="File tree unavailable"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {treeQuery.data?.truncated ? (
        <div className="shrink-0 px-3 py-2 text-xs text-muted-foreground">
          Limited result set
        </div>
      ) : null}
      <div
        className="min-h-0 flex-1 overflow-hidden"
        onClick={handleFileTreeClick}
        onKeyDown={handleFileTreeKeyDown}
        role="presentation"
      >
        {treeQuery.isLoading ? null : (
          <FileTree
            className="h-full min-h-0 bg-background text-sm"
            model={model}
            style={treeHostStyle}
          />
        )}
      </div>
    </div>
  );
}

export function WorkspaceWindowFilesPanel({
  api,
  root,
}: {
  api: ApiClient;
  root: string;
}) {
  const queryClient = useQueryClient();
  const closeWindowFile = useWorkspaceToolStore(
    (state) => state.closeWindowFile,
  );
  const selectWindowFile = useWorkspaceToolStore(
    (state) => state.selectWindowFile,
  );
  const setWindowFileDraftContent = useWorkspaceToolStore(
    (state) => state.setWindowFileDraftContent,
  );
  const setWindowFileSavedContent = useWorkspaceToolStore(
    (state) => state.setWindowFileSavedContent,
  );
  const setWindowFilesEditorDirty = useWorkspaceToolStore(
    (state) => state.setWindowFilesEditorDirty,
  );
  const windowFilesState = useWorkspaceToolStore(
    (state) => state.windowFilesByRoot[root] ?? emptyWorkspaceWindowFilesState,
  );
  const { model, treeQuery } = useWorkspaceFileTreeModel(api, root);
  const openWorkspaceWindowFile = useWorkspaceWindowFileOpener(api);
  const { activePath, fileStates, openFilePaths } = windowFilesState;
  const [fileTreeWidth, setFileTreeWidth] = useState(
    initialWorkspaceToolFileTreeWidth,
  );
  const updateFileTreeWidth = useCallback((width: number) => {
    setFileTreeWidth(width);
    window.localStorage.setItem(
      workspaceToolFileTreeWidthStorageKey,
      String(width),
    );
  }, []);
  const dirty = openFilePaths.some((path) =>
    isWorkspaceWindowFileStateDirty(fileStates[path]),
  );
  const saveFileMutation = useMutation({
    mutationFn: async (input: { content: string; path: string }) =>
      api.workspaceTools.writeFile({
        content: input.content,
        path: input.path,
        root,
      }),
  });

  useEffect(() => {
    setWindowFilesEditorDirty(dirty);
    return () => {
      setWindowFilesEditorDirty(false);
    };
  }, [dirty, setWindowFilesEditorDirty]);

  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [dirty]);

  const handleFileTreeClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const path = getFileTreePathFromEvent(event);
      if (!is.nonEmptyString(path)) return;
      openWorkspaceWindowFile({ path, root });
    },
    [openWorkspaceWindowFile, root],
  );
  const handleFileTreeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      const path = getFileTreePathFromEvent(event);
      if (!is.nonEmptyString(path)) {
        return;
      }
      event.preventDefault();
      openWorkspaceWindowFile({ path, root });
    },
    [openWorkspaceWindowFile, root],
  );
  const saveFile = useCallback(
    async (path: string) => {
      const state = fileStates[path];
      if (
        !isWorkspaceWindowFileStateDirty(state) ||
        state.status !== "text" ||
        saveFileMutation.isPending
      ) {
        return true;
      }

      try {
        const result = await saveFileMutation.mutateAsync({
          content: state.draftContent,
          path,
        });
        setWindowFileSavedContent({
          content: state.draftContent,
          path,
          root,
          size: result.size,
        });
        queryClient.setQueryData(
          queryKeys.workspaceTools.readFile(root, path),
          {
            content: state.draftContent,
            path,
            root,
            size: result.size,
            type: "text",
          } satisfies WorkspaceFileReadResult,
        );
        void queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceTools.fileTree(root),
        });
        void queryClient.invalidateQueries({
          queryKey: queryKeys.workspaceTools.gitDiff(root),
        });
        return true;
      } catch {
        return false;
      }
    },
    [
      fileStates,
      queryClient,
      root,
      saveFileMutation,
      setWindowFileSavedContent,
    ],
  );
  const saveActiveFile = useCallback(() => {
    if (!is.nonEmptyString(activePath)) return;
    void saveFile(activePath);
  }, [activePath, saveFile]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "s" ||
        (!event.ctrlKey && !event.metaKey) ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      event.preventDefault();
      saveActiveFile();
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [saveActiveFile]);
  const closeFile = useCallback(
    async (path: string) => {
      const state = fileStates[path];
      if (isWorkspaceWindowFileStateDirty(state)) {
        const action =
          await window.desktopWindow.confirmSaveWorkspaceFileChanges({ path });
        if (action === "cancel") {
          return;
        }
        if (action === "save") {
          const saved = await saveFile(path);
          if (!saved) {
            return;
          }
        }
      }

      closeWindowFile({ path, root });
    },
    [closeWindowFile, fileStates, root, saveFile],
  );
  const updateActiveFileContent = useCallback(
    (content: string) => {
      if (!is.nonEmptyString(activePath)) return;
      setWindowFileDraftContent({
        content,
        path: activePath,
        root,
      });
    },
    [activePath, root, setWindowFileDraftContent],
  );
  const selectFile = useCallback(
    (path: string) => {
      selectWindowFile({ path, root });
    },
    [root, selectWindowFile],
  );
  if (treeQuery.isError) {
    return (
      <WorkspaceToolEmpty
        detail={getErrorMessage(treeQuery.error)}
        title="File tree unavailable"
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <div className="flex shrink-0 flex-col" style={{ width: fileTreeWidth }}>
        {treeQuery.data?.truncated ? (
          <div className="shrink-0 px-3 py-2 text-xs text-muted-foreground">
            Limited result set
          </div>
        ) : null}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          onClick={handleFileTreeClick}
          onKeyDown={handleFileTreeKeyDown}
          role="presentation"
        >
          {treeQuery.isLoading ? null : (
            <FileTree
              className="h-full min-h-0 bg-background text-sm"
              model={model}
              style={treeHostStyle}
            />
          )}
        </div>
      </div>
      <WorkspaceToolPanelSplitter
        ariaLabel="Resize file tree"
        max={workspaceToolFileTreeWidthMax}
        min={workspaceToolFileTreeWidthMin}
        value={fileTreeWidth}
        onChange={updateFileTreeWidth}
      />
      <div className="min-w-0 flex-1">
        <WorkspaceWindowFileEditor
          activePath={activePath}
          fileStates={fileStates}
          openFilePaths={openFilePaths}
          onClose={(path) => {
            void closeFile(path);
          }}
          onContentChange={updateActiveFileContent}
          onSelect={selectFile}
        />
      </div>
    </div>
  );
}
