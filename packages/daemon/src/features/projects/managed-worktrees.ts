import type { Chat } from "@angel-engine/daemon-api/chat";
import type {
  ManagedWorktreeDeleteInput,
  ManagedWorktreeDeleteResult,
  ManagedWorktreeScanInput,
  ManagedWorktreeSummary,
} from "@angel-engine/daemon-api/projects";
import type { Db } from "../../platform/db";

import fs from "node:fs";
import path from "node:path";
import { Effect } from "effect";

import {
  deleteArchivedChats,
  listArchivedChats,
  listChats,
} from "../chat/repository";
import { DaemonError } from "../../platform/errors";
import {
  managedWorktreePath,
  managedWorktreeRoot,
  removeManagedWorktree,
} from "./git";

/** A managed worktree selected for deletion together with its chats. */
export interface ManagedWorktreeDeletionTarget {
  chatIds: string[];
  path: string;
}

/**
 * Injection seam for the managed-worktree helpers. Every dependency has a
 * production default; tests override the pieces they need instead of standing
 * up a database and a real git checkout.
 */
export interface ManagedWorktreeDependencies {
  deleteChats: (chatIds: string[]) => Effect.Effect<void, DaemonError, Db>;
  listAllChats: () => Effect.Effect<Chat[], DaemonError, Db>;
  listWorktreePathsOnDisk: () => Effect.Effect<string[], DaemonError>;
  pathExists: (worktreePath: string) => boolean;
  removeWorktree: (
    worktreePath: string,
  ) => Effect.Effect<string | undefined, DaemonError>;
}

const defaultDependencies: ManagedWorktreeDependencies = {
  deleteChats: (chatIds) =>
    chatIds.length === 0
      ? Effect.void
      : Effect.asVoid(deleteArchivedChats(chatIds)),
  listAllChats: () =>
    Effect.map(
      Effect.all([listChats(), listArchivedChats()]),
      ([active, archived]) => [...active, ...archived],
    ),
  listWorktreePathsOnDisk: () => listManagedWorktreeDirectories(),
  pathExists: (worktreePath) => fs.existsSync(worktreePath),
  removeWorktree: (worktreePath) => removeManagedWorktree(worktreePath),
};

/**
 * Lists every app-managed worktree known from chat cwds plus any orphan
 * directory sitting under the managed root with no chat pointing at it.
 */
export function scanManagedWorktrees(
  input: ManagedWorktreeScanInput = {},
  dependencies: ManagedWorktreeDependencies = defaultDependencies,
): Effect.Effect<ManagedWorktreeSummary[], DaemonError, Db> {
  return Effect.gen(function* () {
    const chats = yield* dependencies.listAllChats();
    const onDisk = yield* dependencies.listWorktreePathsOnDisk();
    const summaries = summarizeManagedWorktrees(
      chats,
      onDisk,
      dependencies.pathExists,
    );
    return input.eligibleOnly === true
      ? summaries.filter((summary) => summary.eligibleForCleanup)
      : summaries;
  });
}

/**
 * Validates the requested paths and resolves the chats each one owns. Fails
 * when a path is not an app-managed worktree or still has an active chat, so
 * eligibility is re-checked at delete time rather than trusted from the scan.
 */
export function planManagedWorktreeDeletion(
  input: ManagedWorktreeDeleteInput,
  dependencies: ManagedWorktreeDependencies = defaultDependencies,
): Effect.Effect<ManagedWorktreeDeletionTarget[], DaemonError, Db> {
  return Effect.gen(function* () {
    const requested = yield* requireManagedPaths(input.paths);
    const chats = yield* dependencies.listAllChats();
    const grouped = groupChatsByManagedWorktree(chats);

    const targets: ManagedWorktreeDeletionTarget[] = [];
    for (const worktreePath of requested) {
      const owned = grouped.get(worktreePath) ?? [];
      if (owned.some((chat) => !chat.archived)) {
        return yield* Effect.fail(
          DaemonError.worktreeHasActiveChats(worktreePath),
        );
      }
      targets.push({
        chatIds: owned.map((chat) => chat.id),
        path: worktreePath,
      });
    }
    return targets;
  });
}

/**
 * Permanently deletes the chats of each planned worktree and then removes the
 * worktree directory. A worktree already gone from disk still deletes its
 * chats; `removeManagedWorktree` no-ops on a missing path.
 */
export function executeManagedWorktreeDeletion(
  targets: ManagedWorktreeDeletionTarget[],
  dependencies: ManagedWorktreeDependencies = defaultDependencies,
): Effect.Effect<ManagedWorktreeDeleteResult, DaemonError, Db> {
  return Effect.gen(function* () {
    const deletedChatIds: string[] = [];
    const deletedWorktrees: string[] = [];
    for (const target of targets) {
      yield* dependencies.deleteChats(target.chatIds);
      deletedChatIds.push(...target.chatIds);
      const removed = yield* dependencies.removeWorktree(target.path);
      if (removed !== undefined) deletedWorktrees.push(removed);
    }
    return {
      deletedChatCount: deletedChatIds.length,
      deletedChatIds,
      deletedWorktreeCount: deletedWorktrees.length,
      deletedWorktrees,
    };
  });
}

function requireManagedPaths(
  paths: string[],
): Effect.Effect<string[], DaemonError> {
  return Effect.gen(function* () {
    const managed: string[] = [];
    for (const candidate of paths) {
      const worktreePath = managedWorktreePath(candidate);
      if (worktreePath === undefined) {
        return yield* Effect.fail(DaemonError.worktreeNotManaged(candidate));
      }
      managed.push(worktreePath);
    }
    const unique = [...new Set(managed)];
    if (unique.length === 0) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("At least one worktree path is required."),
      );
    }
    return unique;
  });
}

function summarizeManagedWorktrees(
  chats: Chat[],
  onDisk: string[],
  pathExists: (worktreePath: string) => boolean,
): ManagedWorktreeSummary[] {
  const grouped = groupChatsByManagedWorktree(chats);
  for (const worktreePath of onDisk) {
    if (!grouped.has(worktreePath)) grouped.set(worktreePath, []);
  }

  const summaries = [...grouped].map(([worktreePath, owned]) =>
    summarize(worktreePath, owned, pathExists),
  );
  return summaries.sort(compareSummaries);
}

function summarize(
  worktreePath: string,
  owned: Chat[],
  pathExists: (worktreePath: string) => boolean,
): ManagedWorktreeSummary {
  const activeChatCount = owned.filter((chat) => !chat.archived).length;
  return {
    activeChatCount,
    archivedChatCount: owned.length - activeChatCount,
    chatCount: owned.length,
    chatIds: owned.map((chat) => chat.id),
    eligibleForCleanup: activeChatCount === 0,
    existsOnDisk: pathExists(worktreePath),
    latestChatUpdatedAt: latestUpdatedAt(owned),
    path: worktreePath,
    projectId: owned.find((chat) => chat.projectId !== null)?.projectId ?? null,
    projectSlug: projectSlugFromWorktreePath(worktreePath),
  };
}

function groupChatsByManagedWorktree(chats: Chat[]) {
  const grouped = new Map<string, Chat[]>();
  for (const chat of chats) {
    const worktreePath = managedWorktreePath(chat.cwd);
    if (worktreePath === undefined) continue;
    const owned = grouped.get(worktreePath);
    if (owned === undefined) grouped.set(worktreePath, [chat]);
    else owned.push(chat);
  }
  return grouped;
}

function listManagedWorktreeDirectories(): Effect.Effect<
  string[],
  DaemonError
> {
  return Effect.try({
    catch: (cause) =>
      DaemonError.internal(
        cause instanceof Error
          ? cause
          : new Error("Could not read managed worktrees."),
      ),
    try: () => {
      const root = managedWorktreeRoot();
      if (!fs.existsSync(root)) return [];
      const worktrees: string[] = [];
      for (const slug of fs.readdirSync(root, { withFileTypes: true })) {
        if (!slug.isDirectory()) continue;
        const projectDir = path.join(root, slug.name);
        for (const entry of fs.readdirSync(projectDir, {
          withFileTypes: true,
        })) {
          if (!entry.isDirectory()) continue;
          worktrees.push(path.join(projectDir, entry.name));
        }
      }
      return worktrees;
    },
  });
}

function projectSlugFromWorktreePath(worktreePath: string) {
  return path.basename(path.dirname(worktreePath));
}

function latestUpdatedAt(chats: Chat[]) {
  let latest: string | null = null;
  for (const chat of chats) {
    if (latest === null || chat.updatedAt > latest) latest = chat.updatedAt;
  }
  return latest;
}

function compareSummaries(
  left: ManagedWorktreeSummary,
  right: ManagedWorktreeSummary,
) {
  if (left.latestChatUpdatedAt !== right.latestChatUpdatedAt) {
    if (left.latestChatUpdatedAt === null) return 1;
    if (right.latestChatUpdatedAt === null) return -1;
    return left.latestChatUpdatedAt < right.latestChatUpdatedAt ? 1 : -1;
  }
  return left.path < right.path ? -1 : left.path > right.path ? 1 : 0;
}
