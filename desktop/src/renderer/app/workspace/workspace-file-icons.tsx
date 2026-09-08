import {
  createFileTreeIconResolver,
  getBuiltInSpriteSheet,
} from "@pierre/trees";
import { useEffect, useRef } from "react";

export const workspaceFileIconResolver = createFileTreeIconResolver({
  colored: true,
  set: "complete",
});
const workspaceFileTreeIconSpriteSheet = getBuiltInSpriteSheet("complete");

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
