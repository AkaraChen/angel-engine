import type {
  ProbeContext,
  ProviderMatch,
  RemoteDescriptor,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it, vi } from "vitest";

import { createGitHubPlugin } from "./plugin";

const remote = (url: string, name = "origin"): RemoteDescriptor => ({
  fetchUrl: url,
  name,
  pushUrl: null,
  url,
});

const context = (
  remotes: readonly RemoteDescriptor[],
  overrides: Partial<ProbeContext> = {},
): ProbeContext => ({
  defaultRemote: remotes.length === 1 ? remotes[0].name : null,
  explicitProviderId: null,
  explicitRemote: null,
  hostMappings: {},
  projectPath: "/project",
  remotes,
  upstreamRemote: null,
  ...overrides,
});

const operationContext = () => ({
  deadline: Date.now() + 30_000,
  signal: new AbortController().signal,
});

function singleMatch(
  match: ProviderMatch | readonly ProviderMatch[] | null,
): ProviderMatch {
  if (match === null || Array.isArray(match)) {
    throw new Error("Expected one provider match.");
  }
  return match as ProviderMatch;
}

const repository = {
  providerId: "github",
  host: "github.com",
  namespace: ["acme"],
  name: "widgets",
  remoteId: null,
  displayPath: "acme/widgets",
  webUrl: "https://github.com/acme/widgets",
} as const;

const issue = {
  assignees: [{ login: "carol" }],
  author: { login: "alice" },
  body: "Issue body",
  closedAt: null,
  createdAt: "2026-07-20T08:00:00Z",
  labels: [{ name: "bug" }],
  number: 3,
  state: "OPEN",
  title: "Broken widget",
  updatedAt: "2026-07-20T10:00:00Z",
  url: "https://github.com/acme/widgets/issues/3",
};

const pullRequest = {
  additions: 12,
  author: { login: "alice" },
  baseRefName: "main",
  body: "Pull request body",
  changedFiles: 2,
  commits: [{ oid: "abc" }],
  createdAt: "2026-07-20T08:00:00Z",
  deletions: 3,
  headRefName: "feature",
  headRefOid: "abc",
  headRepository: {
    nameWithOwner: "alice/widgets",
    url: "https://github.com/alice/widgets",
  },
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  mergedAt: null,
  number: 7,
  reviewDecision: "APPROVED",
  state: "OPEN",
  title: "Improve widgets",
  updatedAt: "2026-07-20T10:00:00Z",
  url: "https://github.com/acme/widgets/pull/7",
};

describe("GitHub source-control provider", () => {
  it.each([
    "https://github.com/acme/widgets.git",
    "ssh://git@github.com/acme/widgets.git",
    "git@github.com:acme/widgets.git",
  ])("matches GitHub remote %s", (url) => {
    const match = createGitHubPlugin().discovery.match(context([remote(url)]));

    expect(match).toMatchObject({
      providerId: "github",
      remote: { name: "origin", url },
      source: "default-remote",
    });
  });

  it("matches a GitHub Enterprise host only through explicit mapping", () => {
    const enterprise = remote("ssh://git@code.acme.internal/team/app.git");
    const plugin = createGitHubPlugin();

    expect(plugin.discovery.match(context([enterprise]))).toBeNull();
    expect(
      plugin.discovery.match(
        context([enterprise], {
          hostMappings: { "code.acme.internal": "github" },
        }),
      ),
    ).toMatchObject({ providerId: "github" });
  });

  it("returns every matching remote so the registry can report ambiguity", () => {
    const plugin = createGitHubPlugin();
    const matches = plugin.discovery.match(
      context(
        [
          remote("https://github.com/acme/widgets.git", "origin"),
          remote("https://github.com/acme/widgets.git", "mirror"),
        ],
        { defaultRemote: null },
      ),
    );

    expect(matches).toEqual([
      expect.objectContaining({
        remote: expect.objectContaining({ name: "mirror" }),
      }),
      expect.objectContaining({
        remote: expect.objectContaining({ name: "origin" }),
      }),
    ]);
  });

  it("reports authenticated readiness through gh auth status", async () => {
    const runGh = vi.fn(async () => ({ stderr: "", stdout: "" }));
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh,
    });
    const match = singleMatch(
      plugin.discovery.match(
        context([remote("https://github.com/acme/widgets.git")]),
      ),
    );

    await expect(
      plugin.discovery.checkReadiness(match, operationContext()),
    ).resolves.toEqual({ authentication: "authenticated", diagnostics: [] });
    expect(runGh).toHaveBeenCalledWith(
      ["auth", "status", "--hostname", "github.com"],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it("reports missing and unauthenticated gh without throwing", async () => {
    const match = singleMatch(
      createGitHubPlugin().discovery.match(
        context([remote("https://github.com/acme/widgets.git")]),
      ),
    );

    const missing = createGitHubPlugin({ findGh: async () => null });
    await expect(
      missing.discovery.checkReadiness(match, operationContext()),
    ).resolves.toMatchObject({
      authentication: "unavailable",
      diagnostics: [{ code: "source-control/cli-missing" }],
    });

    const unauthenticated = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh: async () => {
        throw Object.assign(new Error("command failed"), {
          stderr: "not logged into GitHub",
        });
      },
    });
    await expect(
      unauthenticated.discovery.checkReadiness(match, operationContext()),
    ).resolves.toMatchObject({
      authentication: "unauthenticated",
      diagnostics: [{ code: "source-control/unauthenticated" }],
    });
  });

  it("parses repository URLs through the generic repository capability", () => {
    const plugin = createGitHubPlugin();

    expect(
      plugin.repositories?.parseUrl("git@github.com:acme/widgets.git"),
    ).toEqual(repository);
    expect(
      plugin.repositories?.parseUrl("https://gitlab.com/acme/widgets"),
    ).toBeNull();
    expect(plugin.repositories?.parseUrl("acme/widgets")).toEqual(repository);
  });

  it("matches repositories and clones through provider capabilities", async () => {
    const runGh = vi.fn(async () => ({ stderr: "", stdout: "" }));
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh,
    });
    await expect(
      plugin.git.clone?.(
        { repository, targetPath: "/tmp/widgets" },
        operationContext(),
      ),
    ).resolves.toEqual({ projectPath: "/tmp/widgets" });
    expect(runGh).toHaveBeenCalledWith(
      ["repo", "clone", "acme/widgets", "/tmp/widgets", "--", "--progress"],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it("lists namespaces and repositories through discovery capabilities", async () => {
    const runGh = vi.fn(async (args: string[]) => {
      if (args[0] === "api" && args[1] === "user") {
        return { stderr: "", stdout: JSON.stringify({ login: "alice" }) };
      }
      if (args[0] === "api") {
        return {
          stderr: "",
          stdout: JSON.stringify([{ login: "acme" }, { login: "globex" }]),
        };
      }
      return {
        stderr: "",
        stdout: JSON.stringify([
          {
            defaultBranchRef: { name: "main" },
            description: "Widget factory",
            isArchived: false,
            isFork: false,
            isPrivate: true,
            name: "widgets",
            nameWithOwner: "acme/widgets",
            owner: { login: "acme" },
            pushedAt: "2026-07-20T10:00:00Z",
            url: "https://github.com/acme/widgets",
          },
        ]),
      };
    });
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh,
    });

    await expect(
      plugin.discovery.listNamespaces?.(
        { limit: 10, query: "ac" },
        operationContext(),
      ),
    ).resolves.toEqual([
      { avatarUrl: null, id: "acme", name: "acme", path: ["acme"] },
    ]);
    await expect(
      plugin.discovery.listRepositories?.(
        { limit: 10, namespace: ["acme"], query: "widget" },
        operationContext(),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        displayPath: "acme/widgets",
        extensions: {
          github: expect.objectContaining({ defaultBranch: "main" }),
        },
        name: "widgets",
        namespace: ["acme"],
        providerId: "github",
      }),
    ]);
  });


});
