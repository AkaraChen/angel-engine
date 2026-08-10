import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  buildReviewThreadsResultFromGraphql,
  fetchGitHubReviewThreads,
} from "./review-threads";

async function expectDaemonFailure(
  effect: Effect.Effect<unknown, { code: string }>,
  code: string,
) {
  const exit = await Effect.runPromiseExit(effect);
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  const failure = Cause.failureOption(exit.cause);
  expect(failure._tag).toBe("Some");
  if (failure._tag === "Some") {
    expect(failure.value).toMatchObject({ code });
  }
}

const BASE_INPUT = {
  cwd: "/tmp/repo",
  owner: "acme",
  prNumber: 12,
  repo: "widgets",
};

function threadsResponse(
  nodes: Array<{
    comments: Array<{
      author: { login: string } | null;
      body: string;
      createdAt: string;
      id: string;
      line?: number | null;
      path?: string | null;
    }>;
    id: string;
    isResolved: boolean;
    line?: number | null;
    path?: string | null;
  }>,
) {
  return {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: nodes.map((thread) => ({
              comments: { nodes: thread.comments },
              id: thread.id,
              isResolved: thread.isResolved,
              line: thread.line ?? null,
              path: thread.path ?? null,
            })),
          },
        },
      },
    },
  };
}

describe("buildReviewThreadsResultFromGraphql", () => {
  it("splits resolved and unresolved threads with comment payloads", () => {
    const result = buildReviewThreadsResultFromGraphql(
      threadsResponse([
        {
          comments: [
            {
              author: { login: "reviewer" },
              body: "Please rename this",
              createdAt: "2026-08-01T00:00:00Z",
              id: "comment-1",
              line: 10,
              path: "src/a.ts",
            },
          ],
          id: "thread-open",
          isResolved: false,
          line: 10,
          path: "src/a.ts",
        },
        {
          comments: [
            {
              author: { login: "bot" },
              body: "nits fixed",
              createdAt: "2026-08-01T01:00:00Z",
              id: "comment-2",
              line: 3,
              path: "src/b.ts",
            },
          ],
          id: "thread-done",
          isResolved: true,
          line: 3,
          path: "src/b.ts",
        },
      ]),
    );

    expect(result.unresolvedCount).toBe(1);
    expect(result.resolvedCount).toBe(1);
    expect(result.unresolved[0]?.id).toBe("thread-open");
    expect(result.unresolved[0]?.comments[0]).toMatchObject({
      author: "reviewer",
      body: "Please rename this",
      id: "comment-1",
      path: "src/a.ts",
    });
    expect(result.threads).toHaveLength(2);
  });

  it("handles empty thread list", () => {
    const result = buildReviewThreadsResultFromGraphql(threadsResponse([]));
    expect(result).toEqual({
      resolvedCount: 0,
      threads: [],
      unresolved: [],
      unresolvedCount: 0,
    });
  });
});

describe("fetchGitHubReviewThreads", () => {
  it("uses injected GhRunner fixtures", async () => {
    const result = await Effect.runPromise(
      fetchGitHubReviewThreads(BASE_INPUT, {
        runGh: async () => ({
          stderr: "",
          stdout: JSON.stringify(
            threadsResponse([
              {
                comments: [
                  {
                    author: null,
                    body: "looks good",
                    createdAt: "2026-08-01T00:00:00Z",
                    id: "c1",
                  },
                ],
                id: "t1",
                isResolved: true,
              },
            ]),
          ),
        }),
        whichGh: async () => "/bin/gh",
      }),
    );

    expect(result.resolvedCount).toBe(1);
    expect(result.unresolvedCount).toBe(0);
  });

  it("maps unauthenticated failures", async () => {
    await expectDaemonFailure(
      fetchGitHubReviewThreads(BASE_INPUT, {
        runGh: async () => {
          const error = new Error("gh failed") as Error & { stderr: string };
          error.stderr = "authentication required";
          throw error;
        },
        whichGh: async () => "/bin/gh",
      }),
      "github-cli-unauthenticated",
    );
  });
});
