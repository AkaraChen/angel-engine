import type {
  ProbeContext,
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
    const match = plugin.discovery.match(
      context([remote("https://github.com/acme/widgets.git")]),
    );
    if (match === null) throw new Error("Expected GitHub match.");

    await expect(
      plugin.discovery.checkReadiness(match, operationContext()),
    ).resolves.toEqual({ authentication: "authenticated", diagnostics: [] });
    expect(runGh).toHaveBeenCalledWith(
      ["auth", "status", "--hostname", "github.com"],
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    );
  });

  it("reports missing and unauthenticated gh without throwing", async () => {
    const match = createGitHubPlugin().discovery.match(
      context([remote("https://github.com/acme/widgets.git")]),
    );
    if (match === null) throw new Error("Expected GitHub match.");

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
});
