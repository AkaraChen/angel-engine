import path from "node:path";

export function absolutePathToTreePath(root: string, absolutePath: string) {
  const relativePath = path.relative(root, absolutePath);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return normalizeGitPath(relativePath);
}

export function resolveWorkspaceTreePath(root: string, treePathInput: string) {
  const absolutePath = path.resolve(root, fromTreePath(treePathInput));
  const relativePath = path.relative(root, absolutePath);

  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Workspace file path must stay inside the workspace root.");
  }

  return absolutePath;
}

export function pathIsInside(root: string, absolutePath: string) {
  const relativePath = path.relative(root, absolutePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function normalizeGitPath(value: string) {
  return value.split(path.sep).join("/");
}

export function fromTreePath(value: string) {
  return value.split("/").join(path.sep);
}
