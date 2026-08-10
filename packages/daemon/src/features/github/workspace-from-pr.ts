import type {
  GitHubCreateWorkspaceFromPullRequestInput,
  GitHubCreateWorkspaceFromPullRequestResult,
} from "@angel-engine/daemon-api/github";
import type { Db } from "../../platform/db";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";
import { Effect } from "effect";

import { DaemonError } from "../../platform/errors";
import { createChat } from "../chat/repository";
import { createProjectWorktree } from "../projects/git";
import { getProject } from "../projects/repository";
import { findGhPath, type GhRunner, mapGhFailure, runGhCli } from "./gh-cli";
import { parseGitHubUrl } from "./resolve";

const positiveInteger = arkType("number").narrow(
  (value) => Number.isInteger(value) && value > 0,
);
const prHeadPayloadSchema = arkType({
  "+": "ignore",
  headRefName: "string > 0",
  number: positiveInteger,
  title: "string > 0",
  url: "string > 0",
});

/**
 * Checkout a PR head into an app-managed worktree and open a chat there.
 * Provider wire stays out of this path — only `gh` + git.
 */
export function createWorkspaceFromPullRequest(
  input: GitHubCreateWorkspaceFromPullRequestInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
  signal?: AbortSignal,
): Effect.Effect<GitHubCreateWorkspaceFromPullRequestResult, DaemonError, Db> {
  return Effect.gen(function* () {
    if (!Number.isInteger(input.number) || input.number <= 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Pull request number is required."),
      );
    }

    const project = yield* getProject(input.projectId);
    if (!project) {
      return yield* Effect.fail(DaemonError.projectNotFound());
    }

    const whichGh = deps.whichGh ?? findGhPath;
    const ghPath = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.githubFetchFailed(cause),
      try: whichGh,
    });
    if (!is.nonEmptyString(ghPath)) {
      return yield* Effect.fail(DaemonError.githubCliMissing());
    }
    const runGh = deps.runGh ?? runGhCli;

    const output = yield* Effect.tryPromise({
      catch: (cause) => mapGhFailure(cause),
      try: () =>
        runGh(
          [
            "pr",
            "view",
            String(input.number),
            "--json",
            "number,title,url,headRefName",
          ],
          { cwd: project.path },
        ),
    });

    let json: unknown;
    try {
      json = JSON.parse(output.stdout);
    } catch (cause) {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          cause,
          "GitHub CLI returned invalid JSON.",
        ),
      );
    }

    const payload = prHeadPayloadSchema(json);
    if (payload instanceof arkType.errors) {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          new TypeError(`Unexpected GitHub CLI payload: ${payload.summary}`),
        ),
      );
    }

    const parsed = parseGitHubUrl(payload.url);
    if (parsed === null || parsed.kind !== "pullRequest") {
      return yield* Effect.fail(
        DaemonError.githubFetchFailed(
          new TypeError(`Unexpected GitHub CLI PR URL: ${payload.url}`),
        ),
      );
    }

    // Fetch PR head into a local tracking ref, then create a managed worktree.
    const remoteRef = `refs/remotes/origin/pr/${payload.number}`;
    const branchName = `angel/pr-${payload.number}`;
    const worktree = yield* createProjectWorktree(
      {
        branchName,
        projectId: input.projectId,
        setupApproval: input.setupApproval,
        startPoint: remoteRef,
        startPointFetch: {
          refspec: `pull/${payload.number}/head:${remoteRef}`,
          remote: "origin",
        },
      },
      signal,
    );

    const chatTitle =
      input.title?.trim() ||
      `PR #${payload.number}: ${payload.title}`.slice(0, 120);
    const chat = yield* createChat({
      cwd: worktree.cwd,
      projectId: input.projectId,
      runtime: input.runtime,
      title: chatTitle,
    });

    return {
      branch: worktree.branch,
      chatId: chat.id,
      cwd: worktree.cwd,
      number: payload.number,
      title: payload.title,
      url: parsed.url,
    };
  });
}
