export function splitWorktreePath(worktreePath: string) {
  const separatorIndex = Math.max(
    worktreePath.lastIndexOf("/"),
    worktreePath.lastIndexOf("\\"),
  );
  return {
    directory: worktreePath.slice(0, separatorIndex + 1),
    identifier: worktreePath.slice(separatorIndex + 1),
  };
}
