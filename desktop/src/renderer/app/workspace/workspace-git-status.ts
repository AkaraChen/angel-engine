export function splitWorkspaceGitBranchLabel(label: string) {
  const separator = label.lastIndexOf("/");
  return separator < 0
    ? { prefix: "", tail: label }
    : {
        prefix: label.slice(0, separator + 1),
        tail: label.slice(separator + 1),
      };
}
