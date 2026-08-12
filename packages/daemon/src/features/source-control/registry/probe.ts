import type {
  ProbeContext,
  ProjectProviderConfig,
  ProviderHostMapping,
  RemoteDescriptor,
} from "@angel-engine/daemon-api/source-control";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { executeGit } from "../local-git/backend";

interface ParsedRemote {
  fetchUrl: string | null;
  pushUrl: string | null;
}

export function parseGitConfigRemotes(config: string) {
  const remotes = new Map<string, ParsedRemote>();
  let currentRemote: string | null = null;

  for (const sourceLine of config.split(/\r?\n/)) {
    const line = sourceLine.trim();
    const section = line.match(/^\[remote\s+"([^"]+)"\]$/i);
    if (section) {
      currentRemote = section[1];
      remotes.set(currentRemote, { fetchUrl: null, pushUrl: null });
      continue;
    }
    if (line.startsWith("[")) {
      currentRemote = null;
      continue;
    }
    if (currentRemote === null) continue;
    const property = line.match(/^(url|pushurl)\s*=\s*(.+)$/i);
    if (!property) continue;
    const remote = remotes.get(currentRemote);
    if (!remote) continue;
    if (property[1].toLowerCase() === "url") remote.fetchUrl = property[2];
    else remote.pushUrl = property[2];
  }

  return remotes;
}

async function output(projectPath: string, args: readonly string[]) {
  const result = await executeGit(projectPath, args);
  return result.stdout.trim();
}

async function optionalOutput(projectPath: string, args: readonly string[]) {
  return output(projectPath, args).catch(() => "");
}

async function readRemotes(projectPath: string): Promise<RemoteDescriptor[]> {
  const commonDir = await optionalOutput(projectPath, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  const config = commonDir
    ? await readFile(path.join(commonDir, "config"), "utf8").catch(() => "")
    : "";
  const parsed = parseGitConfigRemotes(config);
  const names = new Set(
    (await optionalOutput(projectPath, ["remote"]))
      .split(/\r?\n/)
      .filter(Boolean),
  );
  for (const name of parsed.keys()) names.add(name);

  const remotes = await Promise.all(
    [...names].sort().map(async (name): Promise<RemoteDescriptor | null> => {
      const configured = parsed.get(name);
      const fetchUrl =
        (await optionalOutput(projectPath, ["remote", "get-url", name])) ||
        configured?.fetchUrl ||
        "";
      if (!fetchUrl) return null;
      const pushUrl =
        (await optionalOutput(projectPath, [
          "remote",
          "get-url",
          "--push",
          name,
        ])) ||
        configured?.pushUrl ||
        null;
      return { name, url: fetchUrl, fetchUrl, pushUrl };
    }),
  );
  return remotes.filter(
    (remote): remote is RemoteDescriptor => remote !== null,
  );
}

function hostMappingRecord(mappings: readonly ProviderHostMapping[]) {
  return Object.fromEntries(
    [...mappings]
      .sort((left, right) => left.host.localeCompare(right.host))
      .map((mapping) => [mapping.host.toLowerCase(), mapping.providerId]),
  );
}

export async function collectProbeContext(options: {
  projectPath: string;
  providerConfig?: ProjectProviderConfig;
  hostMappings?: readonly ProviderHostMapping[];
}): Promise<ProbeContext> {
  const remotes = await readRemotes(options.projectPath).catch(() => []);
  const upstream = await optionalOutput(options.projectPath, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}",
  ]);
  const upstreamRemote = upstream.includes("/")
    ? upstream.slice(0, upstream.indexOf("/"))
    : null;
  const defaultRemote = remotes.length === 1 ? remotes[0].name : null;

  return {
    defaultRemote,
    explicitProviderId: options.providerConfig?.providerId ?? null,
    explicitRemote: options.providerConfig?.remote ?? null,
    hostMappings: hostMappingRecord(options.hostMappings ?? []),
    projectPath: options.projectPath,
    remotes,
    upstreamRemote,
  };
}
