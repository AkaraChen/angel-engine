import type { ParsedTaskLink } from "@angel-engine/daemon-api/links";
import { createSourceControlRegistry } from "../source-control/providers";
import type { SourceControlRegistry } from "../source-control/registry/registry";

export function parseTaskLink(
  raw: string,
  registry: SourceControlRegistry = createSourceControlRegistry(),
): ParsedTaskLink | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== "linear.app") {
    const resolution = registry.parseLink(raw);
    if (
      resolution.status !== "resolved" ||
      resolution.providerId !== "github"
    ) {
      return null;
    }
    const { descriptor } = resolution;
    const number = Number(descriptor.id);
    if (!Number.isInteger(number) || number <= 0) return null;
    return {
      kind: descriptor.kind === "change-request" ? "pullRequest" : "issue",
      number,
      owner: descriptor.repository.namespace.join("/"),
      provider: "github",
      repo: descriptor.repository.name,
      url: descriptor.url,
    };
  }

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
