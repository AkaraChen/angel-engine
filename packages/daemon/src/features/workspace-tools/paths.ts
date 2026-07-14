import path from "node:path";

export function toTreePath(
  root: string,
  absolutePath: string,
  directory: boolean,
) {
  const relativePath = path.relative(root, absolutePath);
  const normalized = normalizeGitPath(relativePath);
  return directory && !normalized.endsWith("/") ? `${normalized}/` : normalized;
}

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

export function uniqueWorkspaceGitPaths(root: string, pathInputs: string[]) {
  const paths = new Set<string>();

  for (const pathInput of pathInputs) {
    const treePath = normalizeGitPath(pathInput.trim());
    if (!treePath) {
      continue;
    }

    resolveWorkspaceTreePath(root, treePath);
    paths.add(treePath);
  }

  return [...paths];
}

export function pathIsInside(root: string, absolutePath: string) {
  const relativePath = path.relative(root, absolutePath);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

export function isMissingPathError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function normalizeGitPath(value: string) {
  return value.split(path.sep).join("/");
}

export function fromTreePath(value: string) {
  return value.split("/").join(path.sep);
}
