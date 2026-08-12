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

  it("gets and lists issues through the generic work-item capability", async () => {
    const calls: string[][] = [];
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh: async (args) => {
        calls.push(args);
        return {
          stderr: "",
          stdout: JSON.stringify(args[1] === "list" ? [issue] : issue),
        };
      },
    });

    await expect(
      plugin.workItems?.get?.({ id: "3", repository }, operationContext()),
    ).resolves.toMatchObject({
      assignees: [{ login: "carol" }],
      author: { login: "alice" },
      id: "3",
      kind: "issue",
      labels: ["bug"],
      repository,
      state: "open",
    });
    await expect(
      plugin.workItems?.getByUrl?.({ url: issue.url }, operationContext()),
    ).resolves.toMatchObject({ id: "3", title: "Broken widget" });
    await expect(
      plugin.workItems?.list?.(
        { limit: 10, query: "broken", repository },
        operationContext(),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: "3", title: "Broken widget" }),
    ]);
    const listCall = calls.at(-1);
    expect(listCall).toContain("acme/widgets");
    expect(listCall?.at((listCall?.indexOf("--search") ?? -1) + 1)).toBe(
      "broken sort:updated-desc",
    );
  });

  it("reads change requests through every generic read capability", async () => {
    const calls: string[][] = [];
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh: async (args) => {
        calls.push(args);
        if (args[0] === "repo") {
          return {
            stderr: "",
            stdout: JSON.stringify({
              mergeCommitAllowed: false,
              nameWithOwner: "acme/widgets",
              rebaseMergeAllowed: true,
              squashMergeAllowed: true,
              viewerPermission: "WRITE",
            }),
          };
        }
        return {
          stderr: "",
          stdout: JSON.stringify(
            args[1] === "list" ? [pullRequest] : pullRequest,
          ),
        };
      },
    });

    await expect(
      plugin.changeRequests?.get?.({ id: "7", repository }, operationContext()),
    ).resolves.toMatchObject({
      id: "7",
      repository,
      source: {
        name: "feature",
        repository: { displayPath: "alice/widgets" },
      },
      state: "open",
      target: { name: "main", repository },
    });
    await expect(
      plugin.changeRequests?.getByUrl?.(
        { url: pullRequest.url },
        operationContext(),
      ),
    ).resolves.toMatchObject({ id: "7", title: "Improve widgets" });
    await expect(
      plugin.changeRequests?.list?.(
        { limit: 10, query: "improve", repository },
        operationContext(),
      ),
    ).resolves.toEqual([
      expect.objectContaining({ id: "7", title: "Improve widgets" }),
    ]);
    await expect(
      plugin.changeRequests?.status?.(
        { id: "7", repository },
        operationContext(),
      ),
    ).resolves.toMatchObject({
      changeRequest: {
        allowedMergeMethods: ["squash", "rebase"],
        reviewDecision: "approved",
        viewerCanMerge: true,
      },
      checks: null,
    });
    await expect(
      plugin.changeRequests?.resolveHead?.(
        { id: "7", repository },
        operationContext(),
      ),
    ).resolves.toMatchObject({
      ref: "feature",
      remoteUrl: "https://github.com/alice/widgets",
    });
    expect(calls).toContainEqual(
      expect.arrayContaining(["--repo", "acme/widgets"]),
    );
  });

  it("accepts the real gh headRepository shape without a url", async () => {
    const ghPullRequest = {
      ...pullRequest,
      headRepository: {
        id: "R_kgDOSToePQ",
        name: "widgets",
        nameWithOwner: "alice/widgets",
      },
    };
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh: async () => ({
        stderr: "",
        stdout: JSON.stringify([ghPullRequest]),
      }),
    });

    await expect(
      plugin.changeRequests?.list?.(
        { limit: 2, query: "", repository },
        operationContext(),
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "7",
        source: expect.objectContaining({ repository }),
      }),
    ]);
  });

  it("parses GitHub pull request URLs through the git capability", () => {
    expect(
      createGitHubPlugin().git.parseChangeRequestUrl(pullRequest.url),
    ).toEqual({ repository, id: "7" });
    expect(
      createGitHubPlugin().git.parseChangeRequestUrl(issue.url),
    ).toBeNull();
  });

  it("creates, comments, merges, preflights, and publishes through generic capabilities", async () => {
    const ghCalls: string[][] = [];
    const gitCalls: { args: readonly string[]; cwd: string }[] = [];
    const plugin = createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh: async (args) => {
        ghCalls.push(args);
        if (args[0] === "repo") {
          return {
            stderr: "",
            stdout: JSON.stringify({ defaultBranchRef: { name: "main" } }),
          };
        }
        if (args[1] === "create") {
          return {
            stderr: "",
            stdout: JSON.stringify({ number: 7, url: pullRequest.url }),
          };
        }
        if (args[1] === "comment" || args[1] === "merge") {
          return { stderr: "", stdout: "" };
        }
        if (args.includes("comments")) {
          return {
            stderr: "",
            stdout: JSON.stringify({
              comments: [
                {
                  author: { login: "alice" },
                  body: "Looks good",
                  createdAt: "2026-07-20T11:00:00Z",
                  id: "comment-1",
                  url: `${pullRequest.url}#issuecomment-1`,
                },
              ],
            }),
          };
        }
        return { stderr: "", stdout: JSON.stringify(pullRequest) };
      },
      runGit: async (cwd, args) => {
        gitCalls.push({ args, cwd });
        return { stderr: "", stdout: "" };
      },
    });

    await expect(
      plugin.changeRequests?.create?.(
        {
          body: "Body",
          draft: true,
          repository,
          sourceBranch: "feature",
          targetBranch: "main",
          title: "Improve widgets",
        },
        operationContext(),
      ),
    ).resolves.toMatchObject({ id: "7", source: { name: "feature" } });
    await expect(
      plugin.changeRequests?.comment?.(
        { body: "Looks good", id: "7", repository },
        operationContext(),
      ),
    ).resolves.toMatchObject({ body: "Looks good", id: "comment-1" });
    await expect(
      plugin.changeRequests?.merge?.(
        { id: "7", method: "squash", repository },
        operationContext(),
      ),
    ).resolves.toMatchObject({ id: "7" });
    await expect(
      plugin.changeRequests?.preflight?.(
        { repository, sourceBranch: "feature", targetBranch: null },
        operationContext(),
      ),
    ).resolves.toMatchObject({ targetBranch: "main" });
    await expect(
      plugin.git.publishBranch?.(
        {
          forceWithLease: false,
          localBranch: "feature",
          projectPath: "/repos/widgets",
          remoteName: "origin",
          repository,
        },
        operationContext(),
      ),
    ).resolves.toEqual({ remoteName: "origin", remoteRef: "feature" });

    expect(ghCalls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining(["pr", "create", "--repo", "acme/widgets"]),
        ["pr", "merge", "7", "--repo", "acme/widgets", "--squash"],
      ]),
    );
    expect(gitCalls).toEqual([
      {
        args: ["push", "-u", "origin", "feature"],
        cwd: "/repos/widgets",
      },
    ]);
  });
});
