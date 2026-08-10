export type WorkspaceGitPanelView = "changes" | "history";

export function formatWorkspaceGitCommitTime(
  iso: string,
  locale?: string,
): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function workspaceGitRemoteFromUpstream(upstream?: string) {
  if (!upstream) return "origin";
  const slash = upstream.indexOf("/");
  if (slash <= 0) return "origin";
  return upstream.slice(0, slash);
}
