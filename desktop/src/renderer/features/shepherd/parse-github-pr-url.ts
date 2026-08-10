export interface ParsedGitHubPullRequestUrl {
  owner: string;
  prNumber: number;
  repo: string;
}

/** Parse `https://github.com/owner/repo/pull/42` (and www.) into parts. */
export function parseGitHubPullRequestUrl(
  url: string,
): ParsedGitHubPullRequestUrl | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host !== "github.com" && host !== "www.github.com") return null;
    const match = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/.exec(
      parsed.pathname,
    );
    if (match === null) return null;
    const owner = match[1];
    const repo = match[2];
    const prNumber = Number(match[3]);
    if (
      owner === undefined ||
      repo === undefined ||
      !Number.isInteger(prNumber) ||
      prNumber <= 0
    ) {
      return null;
    }
    return { owner, prNumber, repo };
  } catch {
    return null;
  }
}
