import type {
  ChangeRequestHeadResult,
  CreateChangeRequestWorkspaceResult,
} from "@angel-engine/daemon-api/source-control";
import { Effect } from "effect";

import { DaemonError } from "../../../platform/errors";
import type { Db } from "../../../platform/db";
import { createChat } from "../../chat/repository";
import { getProject } from "../../projects/repository";
import { createProjectWorktree } from "../local-git/projects";

export interface CreateChangeRequestWorkspaceInput {
  number: number;
  projectId: string;
  runtime?: string;
  setupApproval?: string;
  title?: string;
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
