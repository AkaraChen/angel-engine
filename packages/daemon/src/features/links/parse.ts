import type { ParsedTaskLink } from "@angel-engine/daemon-api/links";
import { parseGitHubUrl } from "../github/resolve";

export function parseTaskLink(raw: string): ParsedTaskLink | null {
  const github = parseGitHubUrl(raw);
  if (github !== null) return { ...github, provider: "github" };

  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== "linear.app") return null;

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4 || segments[1] !== "issue") return null;
  const identifier = segments[2]?.toUpperCase();
  const match = /^([A-Z][A-Z0-9]*)-(\d+)$/.exec(identifier ?? "");
  if (match === null) return null;

  return {
    identifier,
    kind: "issue",
    provider: "linear",
    team: match[1],
    url: `https://linear.app/${segments[0]}/issue/${identifier}${segments[3] === undefined ? "" : `/${segments[3]}`}`,
  };
}
