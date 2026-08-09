import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { Db } from "../../platform/db";
import {
  createPullRequest,
  type GitRunner,
  pullRequestPreflight,
  pullRequestTitleFromBranch,
} from "./pull-request";

const testDb = new Db({ database: Effect.die("Database must not be used.") });

function withTestDb<A, E>(effect: Effect.Effect<A, E, Db>) {
  return Effect.runPromise(effect.pipe(Effect.provideService(Db, testDb)));
}

function gitRunner(calls: string[][] = []): GitRunner {
  return async (args) => {
    calls.push(args);
    const command = args.join(" ");
    if (command === "branch --show-current") {
      return { stderr: "", stdout: "feature/create-pr\n" };
    }
    if (command.startsWith("remote get-url")) {
      return { stderr: "", stdout: "git@github.com:acme/widgets.git\n" };
    }
    if (command.startsWith("rev-list --count")) {
      return { stderr: "", stdout: "2\n" };
    }
    if (command.startsWith("log ")) {
      return {
        stderr: "",
        stdout: "abc1234\tAdd PR dialog\tDetails\0def5678\tAdd API\t\0",
      };
    }
    if (command.startsWith("diff --shortstat")) {
      return { stderr: "", stdout: " 4 files changed, 80 insertions(+)\n" };
    }
    if (command.startsWith("for-each-ref")) {
      return {
        stderr: "",
        stdout:
          "origin\norigin/HEAD\norigin/main\norigin/feature/create-pr\norigin/release\n",
      };
    }
    return { stderr: "", stdout: "/repos/widgets\n" };
  };
}

const pr = {
  baseRefName: "main",
  createdAt: "2026-08-09T00:00:00Z",
  headRefName: "feature/create-pr",
  isDraft: false,
  number: 42,
  state: "OPEN",
  title: "Create pull requests",
  updatedAt: "2026-08-09T00:00:00Z",
  url: "https://github.com/acme/widgets/pull/42",
};

describe("pullRequestPreflight", () => {
  it("builds deterministic prefills and base branches", async () => {
    const result = await withTestDb(
      pullRequestPreflight("/repos/widgets", undefined, {
        readFile: async () => "## Checklist\n- [ ] Tested",
        runGh: async (args) => ({
          stderr: "",
          stdout: JSON.stringify(
            args[0] === "repo" ? { defaultBranchRef: { name: "main" } } : [],
          ),
        }),
        runGit: gitRunner(),
        saveRecord: async (record) => record,
        whichGh: async () => "/usr/bin/gh",
      }),
    );

    expect(result).toMatchObject({
      aheadCount: 2,
      availableBaseBranches: ["main", "release"],
      canCreate: true,
      head: "feature/create-pr",
      title: "feature create pr",
    });
    expect(result.body).toContain("## Checklist");
    expect(result.body).toContain("- Add PR dialog (abc1234)");
  });

  it("returns an existing pull request and persists its URL", async () => {
    const saved: string[] = [];
    const result = await withTestDb(
      pullRequestPreflight("/repos/widgets", undefined, {
        runGh: async (args) => ({
          stderr: "",
          stdout: JSON.stringify(
            args[0] === "repo" ? { defaultBranchRef: { name: "main" } } : [pr],
          ),
        }),
        runGit: gitRunner(),
        saveRecord: async (record) => {
          saved.push(record.url);
          return record;
        },
        whichGh: async () => "/usr/bin/gh",
      }),
    );

    expect(result.existing?.url).toBe(pr.url);
    expect(saved).toEqual([pr.url]);
  });

  it("cleans remote aliases and the head branch from base choices", async () => {
    const result = await withTestDb(
      pullRequestPreflight("/repos/widgets", undefined, {
        runGh: async (args) => ({
          stderr: "",
          stdout: JSON.stringify(
            args[0] === "repo" ? { defaultBranchRef: { name: "main" } } : [],
          ),
        }),
        runGit: gitRunner(),
        saveRecord: async (record) => record,
        whichGh: async () => "/usr/bin/gh",
      }),
    );

    expect(result.availableBaseBranches).toEqual(["main", "release"]);
  });
});

describe("pullRequestTitleFromBranch", () => {
  it("removes generated workspace prefixes and separators", () => {
    expect(pullRequestTitleFromBranch("agent/hexa/32349858")).toBe(
      "hexa 32349858",
    );
  });

  it("uses the latest commit instead of an opaque PR-number branch", () => {
    expect(pullRequestTitleFromBranch("pr-228", "Create pull requests")).toBe(
      "Create pull requests",
    );
  });
});

describe("createPullRequest", () => {
  it("models push success followed by create failure", async () => {
    const gitCalls: string[][] = [];
    const result = await withTestDb(
      createPullRequest(
        {
          base: "main",
          body: "Body",
          draft: false,
          root: "/repos/widgets",
          title: "Title",
        },
        {
          runGh: async (args) => {
            if (args[1] === "create") throw new Error("network timed out");
            return { stderr: "", stdout: "[]" };
          },
          runGit: gitRunner(gitCalls),
          saveRecord: async (record) => record,
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result).toEqual({
      error: {
        code: "github-network-unavailable",
        message: "GitHub is unavailable. Check your network and retry.",
      },
      pushed: true,
      status: "failed",
    });
    expect(gitCalls.some((args) => args[0] === "push")).toBe(true);
  });

  it("upserts an already-existing pull request instead of failing", async () => {
    const saved: string[] = [];
    const result = await withTestDb(
      createPullRequest(
        {
          base: "main",
          body: "Body",
          draft: false,
          root: "/repos/widgets",
          skipPush: true,
          title: "Title",
        },
        {
          runGh: async (args) => {
            if (args[1] === "create") throw new Error("already exists");
            return { stderr: "", stdout: JSON.stringify([pr]) };
          },
          runGit: gitRunner(),
          saveRecord: async (record) => {
            saved.push(record.url);
            return record;
          },
          whichGh: async () => "/usr/bin/gh",
        },
      ),
    );

    expect(result.status).toBe("existing");
    expect(saved).toEqual([pr.url]);
  });
});
