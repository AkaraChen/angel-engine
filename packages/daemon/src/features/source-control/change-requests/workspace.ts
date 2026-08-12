import type { ChangeRequestHeadResult } from "@angel-engine/daemon-api/source-control";
import { Effect } from "effect";

import type { Db } from "../../../platform/db";
import { DaemonError } from "../../../platform/errors";
import { createChat } from "../../chat/repository";
import { getProject } from "../../projects/repository";
import { localGitBackend } from "../local-git/backend";
import { createProjectWorktree } from "../local-git/projects";
import { createGitHubPlugin } from "../providers/github/plugin";

type GhRunner = (
  args: string[],
  options?: { cwd?: string; timeoutMs?: number },
) => Promise<{ stderr: string; stdout: string }>;

export interface CreateChangeRequestWorkspaceInput {
  number: number;
  projectId: string;
  runtime?: string;
  setupApproval?: string;
  title?: string;
}

export interface CreateChangeRequestWorkspaceResult {
  branch: string;
  chatId: string;
  cwd: string;
  number: number;
  title: string;
  url: string;
}

/**
 * Checkout a PR head into an app-managed worktree and open a chat there.
 * Resolve the provider head, then compose local worktree and chat services.
 */
export function createWorkspaceFromPullRequest(
  input: CreateChangeRequestWorkspaceInput,
  deps: {
    runGh?: GhRunner;
    whichGh?: () => Promise<string | null>;
  } = {},
  signal?: AbortSignal,
): Effect.Effect<CreateChangeRequestWorkspaceResult, DaemonError, Db> {
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

    const plugin = createGitHubPlugin({
      findGh: deps.whichGh,
      runGh: deps.runGh,
    });
    const remoteUrl = yield* Effect.tryPromise({
      catch: (cause) => DaemonError.gitFailed(cause),
      try: () => localGitBackend.remoteUrl(project.path, "origin"),
    });
    const repository = plugin.git.parseUrl(remoteUrl);
    const resolveHead = plugin.changeRequests?.resolveHead;
    if (repository === null || resolveHead === undefined) {
      return yield* Effect.fail(DaemonError.sourceControlUrlUnsupported());
    }
    const resolved = yield* Effect.tryPromise({
      catch: (cause) =>
        cause instanceof DaemonError
          ? cause
          : DaemonError.sourceControlFetchFailed(cause),
      try: () =>
        resolveHead(
          { id: String(input.number), repository },
          {
            deadline: Date.now() + 30_000,
            signal: signal ?? new AbortController().signal,
          },
        ),
    });

    return yield* createWorkspaceFromResolvedChangeRequest(
      input,
      resolved,
      signal,
    );
  });
}

/** Compose local worktree/chat services after a provider head was resolved. */
export function createWorkspaceFromResolvedChangeRequest(
  input: CreateChangeRequestWorkspaceInput,
  resolved: ChangeRequestHeadResult,
  signal?: AbortSignal,
): Effect.Effect<CreateChangeRequestWorkspaceResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const project = yield* getProject(input.projectId);
    if (!project) return yield* Effect.fail(DaemonError.projectNotFound());

    // Fetch PR head into a local tracking ref, then create a managed worktree.
    const remoteRef = `refs/remotes/origin/pr/${resolved.changeRequest.number}`;
    const branchName = `angel/pr-${resolved.changeRequest.number}`;
    const fetchTarget = changeRequestFetchTarget(resolved);
    const worktree = yield* createProjectWorktree(
      {
        branchName,
        projectId: input.projectId,
        setupApproval: input.setupApproval,
        startPoint: remoteRef,
        startPointFetch: {
          refspec: `${fetchTarget.ref}:${remoteRef}`,
          remote: fetchTarget.remote,
        },
      },
      signal,
    );

    const chatTitle =
      input.title?.trim() ||
      `PR #${resolved.changeRequest.number}: ${resolved.changeRequest.title}`.slice(
        0,
        120,
      );
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
      number: resolved.changeRequest.number ?? input.number,
      title: resolved.changeRequest.title,
      url: resolved.changeRequest.webUrl,
    };
  });
}

export function changeRequestFetchTarget(resolved: ChangeRequestHeadResult): {
  ref: string;
  remote: string;
} {
  const sameRepository =
    resolved.changeRequest.source.repository.displayPath ===
    resolved.changeRequest.repository.displayPath;
  return sameRepository
    ? {
        ref: `pull/${resolved.changeRequest.number ?? resolved.changeRequest.id}/head`,
        remote: "origin",
      }
    : { ref: resolved.ref, remote: resolved.remoteUrl };
}
