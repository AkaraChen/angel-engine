import type {
  RepositoryIdentity,
  SourceControlProviderPlugin,
} from "@angel-engine/daemon-api/source-control";

const host = "code.example.test";

/** Smallest useful provider: discovery, authentication, and repository identity. */
export function createExampleProvider(): SourceControlProviderPlugin {
  return {
    manifest: {
      capabilities: ["provider.auth", "repositoryIdentity"],
      displayName: "Example Source Control",
      hosts: [host],
      id: "example",
    },
    discovery: {
      match: (context) => {
        const remote = context.remotes.find(
          (candidate) => parseExampleRepositoryUrl(candidate.url) !== null,
        );
        if (!remote) return null;
        return {
          providerId: "example",
          remote,
          repository: parseExampleRepositoryUrl(remote.url),
          score: context.defaultRemote === remote.name ? 200 : 100,
          source:
            context.defaultRemote === remote.name ? "default-remote" : "remote",
        };
      },
      checkReadiness: async () => ({
        authentication: "authenticated",
        diagnostics: [],
      }),
    },
    auth: {
      status: async () => ({
        authentication: "authenticated",
        diagnostics: [],
      }),
    },
    git: {
      parseChangeRequestUrl: () => null,
      parseUrl: parseExampleRepositoryUrl,
    },
    repositories: { parseUrl: parseExampleRepositoryUrl },
  };
}

function parseExampleRepositoryUrl(raw: string): RepositoryIdentity | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const [namespace, rawName] = url.pathname.split("/").filter(Boolean);
  if (url.hostname !== host || !namespace || !rawName) return null;
  const name = rawName.endsWith(".git") ? rawName.slice(0, -4) : rawName;
  return {
    displayPath: `${namespace}/${name}`,
    host,
    name,
    namespace: [namespace],
    providerId: "example",
    remoteId: null,
    webUrl: `https://${host}/${namespace}/${name}`,
  };
}
