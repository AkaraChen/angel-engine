import { describe, expect, it, vi } from "vitest";

import {
  buildGitHubReviewThreads,
  listGitHubReviewThreads,
  resolveGitHubReviewThread,
} from "./reviews";
import type { GhRunner } from "./gh-cli";

const repository = {
  providerId: "github",
  host: "github.com",
  namespace: ["acme"],
  name: "widgets",
  remoteId: null,
  displayPath: "acme/widgets",
  webUrl: "https://github.com/acme/widgets",
};
const context = {
  deadline: Date.now() + 30_000,
  signal: new AbortController().signal,
};

function thread() {
  return {
    comments: {
      nodes: [
        {
          author: { login: "reviewer" },
          body: "Please rename this",
          createdAt: "2026-08-01T00:00:00Z",
          id: "comment-1",
          line: 10,
          path: "src/a.ts",
          url: "https://github.com/acme/widgets/pull/12#discussion_r1",
        },
      ],
    },
    id: "thread-1",
    isOutdated: false,
    isResolved: false,
    line: 10,
    path: "src/a.ts",
  };
}

describe("buildGitHubReviewThreads", () => {
  it("maps thread state, location, and comments", () => {
    const result = buildGitHubReviewThreads({
      data: {
        repository: {
          pullRequest: { reviewThreads: { nodes: [thread()] } },
        },
      },
    });
    expect(result[0]).toMatchObject({
      id: "thread-1",
      location: { endLine: 10, path: "src/a.ts", side: "right", startLine: 10 },
      resolvable: true,
      state: "unresolved",
    });
    expect(result[0]?.comments[0]).toMatchObject({
      author: { login: "reviewer" },
      body: "Please rename this",
      id: "comment-1",
    });
  });

  it("queries Actor fields safely and accepts a non-User author", async () => {
    const runGh = vi.fn<GhRunner>(async () => ({
      stderr: "",
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: { reviewThreads: { nodes: [thread()] } },
          },
        },
      }),
    }));

    const result = await listGitHubReviewThreads(
      { id: "12", repository },
      context,
      { findGh: async () => "/usr/bin/gh", runGh },
    );
    const queryArgument = runGh.mock.calls[0]?.[0].find((argument) =>
      argument.startsWith("query="),
    );

    expect(queryArgument).toContain(
      "author { login avatarUrl url ... on User { id name } }",
    );
    expect(queryArgument).not.toMatch(/author\s*\{\s*id\b/);
    expect(result[0]?.comments[0]?.author).toMatchObject({
      displayName: null,
      id: null,
      login: "reviewer",
    });
  });
});

describe("resolveGitHubReviewThread", () => {
  it("returns the resolved generic thread", async () => {
    const result = await resolveGitHubReviewThread(
      { repository, threadId: "thread-1" },
      context,
      {
        findGh: async () => "/usr/bin/gh",
        runGh: async () => ({
          stderr: "",
          stdout: JSON.stringify({
            data: {
              resolveReviewThread: {
                thread: { ...thread(), isResolved: true },
              },
            },
          }),
        }),
      },
    );
    expect(result).toMatchObject({ resolvable: false, state: "resolved" });
  });

  it("uses the Actor-safe author selection in the mutation", async () => {
    const runGh = vi.fn<GhRunner>(async () => ({
      stderr: "",
      stdout: JSON.stringify({
        data: {
          resolveReviewThread: {
            thread: { ...thread(), isResolved: true },
          },
        },
      }),
    }));

    await resolveGitHubReviewThread(
      { repository, threadId: "thread-1" },
      context,
      { findGh: async () => "/usr/bin/gh", runGh },
    );
    const queryArgument = runGh.mock.calls[0]?.[0].find((argument) =>
      argument.startsWith("query="),
    );

    expect(queryArgument).toContain(
      "author { login avatarUrl url ... on User { id name } }",
    );
    expect(queryArgument).not.toMatch(/author\s*\{\s*id\b/);
  });
});
