import type { GitStatus } from "@pierre/trees";
import type { WorkspaceToolGitStatus } from "@shared/workspace-tools";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";

import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
  prepareFileTreeInput,
} from "@pierre/trees";
import { useFileTree } from "@pierre/trees/react";
import is from "@sindresorhus/is";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { ApiClient } from "@/platform/api-client";
import type { WorkspaceToolCssVariableStyle } from "@/app/workspace/workspace-tool-layout";
import { queryKeys } from "@/platform/query-keys";

export const workspaceFileIconResolver = createFileTreeIconResolver({
  colored: true,
  set: "complete",
});
const workspaceFileTreeIconSpriteSheet = getBuiltInSpriteSheet("complete");

export const treeHostStyle: WorkspaceToolCssVariableStyle = {
  "--trees-bg-muted-override": "var(--secondary)",
  "--trees-bg-override": "var(--background)",
  "--trees-gap-override": "6px",
  "--trees-input-bg-override": "var(--muted)",
  "--trees-item-margin-x-override": "0px",
  "--trees-item-padding-x-override": "6px",
  "--trees-item-row-gap-override": "4px",
  "--trees-level-gap-override": "8px",
  "--trees-padding-inline-override": "8px",
  height: "100%",
  minHeight: 0,
};

export const workspaceFileTreeIconColorStyle: WorkspaceToolCssVariableStyle = {
  "--trees-file-icon-color-astro":
    "var(--trees-file-icon-color, var(--trees-icon-purple))",
  "--trees-file-icon-color-babel":
    "var(--trees-file-icon-color, var(--trees-icon-yellow))",
  "--trees-file-icon-color-bash":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-biome":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-bootstrap":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-browserslist":
    "var(--trees-file-icon-color, var(--trees-icon-yellow))",
  "--trees-file-icon-color-bun":
    "var(--trees-file-icon-color, var(--trees-icon-mauve))",
  "--trees-file-icon-color-c":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-claude":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-cpp":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-css":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-database":
    "var(--trees-file-icon-color, var(--trees-icon-purple))",
  "--trees-file-icon-color-default":
    "var(--trees-file-icon-color, var(--trees-icon-gray))",
  "--trees-file-icon-color-docker":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-eslint":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-git":
    "var(--trees-file-icon-color, var(--trees-icon-vermilion))",
  "--trees-file-icon-color-go":
    "var(--trees-file-icon-color, var(--trees-icon-cyan))",
  "--trees-file-icon-color-graphql":
    "var(--trees-file-icon-color, var(--trees-icon-pink))",
  "--trees-file-icon-color-html":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-image":
    "var(--trees-file-icon-color, var(--trees-icon-pink))",
  "--trees-file-icon-color-javascript":
    "var(--trees-file-icon-color, var(--trees-icon-yellow))",
  "--trees-file-icon-color-json":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-markdown":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-mcp":
    "var(--trees-file-icon-color, var(--trees-icon-teal))",
  "--trees-file-icon-color-npm":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-oxc":
    "var(--trees-file-icon-color, var(--trees-icon-cyan))",
  "--trees-file-icon-color-postcss":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-prettier":
    "var(--trees-file-icon-color, var(--trees-icon-teal))",
  "--trees-file-icon-color-python":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-react":
    "var(--trees-file-icon-color, var(--trees-icon-cyan))",
  "--trees-file-icon-color-ruby":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-rust":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-sass":
    "var(--trees-file-icon-color, var(--trees-icon-pink))",
  "--trees-file-icon-color-svg":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-svelte":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-svgo":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-swift":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-table":
    "var(--trees-file-icon-color, var(--trees-icon-teal))",
  "--trees-file-icon-color-tailwind":
    "var(--trees-file-icon-color, var(--trees-icon-cyan))",
  "--trees-file-icon-color-terraform":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-text":
    "var(--trees-file-icon-color, var(--trees-icon-gray))",
  "--trees-file-icon-color-typescript":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-vite":
    "var(--trees-file-icon-color, var(--trees-icon-purple))",
  "--trees-file-icon-color-vscode":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-vue":
    "var(--trees-file-icon-color, var(--trees-icon-green))",
  "--trees-file-icon-color-wasm":
    "var(--trees-file-icon-color, var(--trees-icon-indigo))",
  "--trees-file-icon-color-webpack":
    "var(--trees-file-icon-color, var(--trees-icon-blue))",
  "--trees-file-icon-color-yml":
    "var(--trees-file-icon-color, var(--trees-icon-red))",
  "--trees-file-icon-color-zig":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
  "--trees-file-icon-color-zip":
    "var(--trees-file-icon-color, var(--trees-icon-orange))",
};

export function useWorkspaceFileTreeModel(api: ApiClient, root: string) {
  const { model } = useFileTree({
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    icons: { colored: true, set: "complete" },
    id: `workspace-file-tree-${root}`,
    initialExpansion: 0,
    initialVisibleRowCount: 32,
    paths: [],
    search: false,
  });
  const treeQuery = useQuery({
    queryFn: async () => api.workspaceTools.fileTree({ root }),
    queryKey: queryKeys.workspaceTools.fileTree(root),
    retry: false,
    staleTime: 10_000,
  });

  useEffect(() => {
    if (!treeQuery.data) return;

    const preparedInput = prepareFileTreeInput(treeQuery.data.paths, {
      flattenEmptyDirectories: true,
      sort: "default",
    });
    model.resetPaths(treeQuery.data.paths, { preparedInput });
    model.setGitStatus(
      treeQuery.data.gitStatus.map((entry) => ({
        path: entry.path,
        status: toTreeGitStatus(entry.status),
      })),
    );
  }, [model, treeQuery.data]);

  return { model, treeQuery };
}

export function WorkspaceFileTreeIconSprite() {
  const spriteRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const spriteNode = spriteRef.current;
    if (!spriteNode) return;

    const template = document.createElement("template");
    template.innerHTML = workspaceFileTreeIconSpriteSheet.trim();
    spriteNode.replaceChildren(template.content.cloneNode(true));
  }, []);

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute size-0 overflow-hidden"
      ref={spriteRef}
    />
  );
}

export function WorkspaceFileTreeFileIcon({ path }: { path: string }) {
  const icon = workspaceFileIconResolver.resolveIcon(
    "file-tree-icon-file",
    path,
  );
  const name = icon.name.replace(/^#/, "");
  const token = icon.token ?? "default";
  const width = icon.width ?? 16;
  const height = icon.height ?? 16;

  return (
    <svg
      aria-hidden="true"
      className="size-3.5 shrink-0"
      data-icon-name={icon.remappedFrom ?? icon.name}
      data-icon-token={token}
      fill="currentColor"
      height={height}
      style={{
        color: `var(--trees-file-icon-color-${token}, var(--trees-file-icon-color-default))`,
      }}
      viewBox={icon.viewBox ?? `0 0 ${width} ${height}`}
      width={width}
    >
      <use href={`#${name}`} />
    </svg>
  );
}

export function getFileTreePathFromEvent(
  event: ReactKeyboardEvent<HTMLElement> | ReactMouseEvent<HTMLElement>,
) {
  const directTarget =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>(
          "[data-item-path][data-item-type='file']",
        )
      : null;
  const directTargetPath = directTarget?.dataset.itemPath;
  if (is.nonEmptyString(directTargetPath)) {
    return directTargetPath;
  }

  for (const target of event.nativeEvent.composedPath()) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }
    if (
      target.dataset.itemType === "file" &&
      typeof target.dataset.itemPath === "string" &&
      target.dataset.itemPath.length > 0
    ) {
      return target.dataset.itemPath;
    }
  }

  return null;
}

function toTreeGitStatus(status: WorkspaceToolGitStatus): GitStatus {
  return status;
}
