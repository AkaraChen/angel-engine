import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import { DaemonError } from "../../platform/errors";
import { listGitHubRepositories, listGitHubRepositoryOwners } from "./repos";

const viewer = { login: "octocat" };
const organizations = [{ login: "acme" }, { login: "globex" }];
const repositories = [
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
  {
    defaultBranchRef: { name: "" },
    description: null,
    isArchived: true,
    isFork: true,
    isPrivate: false,
    name: "gadgets",
    nameWithOwner: "acme/gadgets",
    owner: { login: "acme" },
    pushedAt: "2026-07-24T10:00:00Z",
    url: "https://github.com/acme/gadgets",
  },
];

function runner(responses: (args: string[]) => string, calls: string[][] = []) {
  return async (args: string[]) => {
    calls.push(args);
    return { stderr: "", stdout: responses(args) };
  };
}

describe("listGitHubRepositoryOwners", () => {
  it("lists the viewer first, then their organizations", async () => {
    const result = await Effect.runPromise(
      listGitHubRepositoryOwners({
        runGh: runner((args) =>
          args[1] === "user"
            ? JSON.stringify(viewer)
            : JSON.stringify(organizations),
        ),
        whichGh: async () => "/usr/bin/gh",
      }),
    );

    expect(result.owners).toEqual([
      { kind: "user", login: "octocat" },
      { kind: "organization", login: "acme" },
      { kind: "organization", login: "globex" },
    ]);
  });

  it("degrades to the viewer when the org scope is missing", async () => {
    const result = await Effect.runPromise(
      listGitHubRepositoryOwners({
        runGh: runner((args) => {
          if (args[1] === "user") return JSON.stringify(viewer);
          throw new Error("HTTP 403: Resource not accessible");
        }),
        whichGh: async () => "/usr/bin/gh",
      }),
    );

    expect(result.owners.map((owner) => owner.login)).toEqual(["octocat"]);
  });

  it("fails when the GitHub CLI is missing", async () => {
    const exit = await Effect.runPromiseExit(
      listGitHubRepositoryOwners({ whichGh: async () => null }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).toBe("Some");
      if (failure._tag === "Some") {
        expect(failure.value).toBeInstanceOf(DaemonError);
        expect(failure.value.code).toBe("source-control/cli-missing");
      }
    }
  });
});

describe("listGitHubRepositories", () => {
  it("normalizes repositories and sorts by most recent push", async () => {
    const calls: string[][] = [];
    const result = await Effect.runPromise(
      listGitHubRepositories(
        { owner: "acme" },
        {
          runGh: runner(() => JSON.stringify(repositories), calls),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(calls[0]?.slice(0, 3)).toEqual(["repo", "list", "acme"]);
    expect(result.repositories.map((entry) => entry.name)).toEqual([
      "gadgets",
      "widgets",
    ]);
    expect(result.repositories[1]).toMatchObject({
      defaultBranch: "main",
      description: "Widget factory",
      isPrivate: true,
      owner: "acme",
    });
    expect(result.repositories[0]?.defaultBranch).toBeNull();
    expect(result.repositories[0]?.description).toBeNull();
  });

  it("rejects a blank owner before shelling out", async () => {
    const exit = await Effect.runPromiseExit(
      listGitHubRepositories(
        { owner: "   " },
        {
          runGh: async () => {
            throw new Error("gh should not run");
          },
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });

  it("reports an unexpected payload instead of returning partial data", async () => {
    const exit = await Effect.runPromiseExit(
      listGitHubRepositories(
        { owner: "acme" },
        {
          runGh: runner(() => JSON.stringify([{ name: "widgets" }])),
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      const failure = Cause.failureOption(exit.cause);
      if (failure._tag === "Some") {
        expect(failure.value.code).toBe("source-control/fetch-failed");
      }
    }
  });
});
