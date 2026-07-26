import type { Chat } from "@angel-engine/daemon-api/chat";

import os from "node:os";
import path from "node:path";
import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { Db } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
import {
  type ManagedWorktreeDependencies,
  executeManagedWorktreeDeletion,
  planManagedWorktreeDeletion,
  scanManagedWorktrees,
} from "./managed-worktrees";

// Every dependency is faked, so the database is never touched.
const testDbLayer = Layer.succeed(
  Db,
  new Db({ database: Effect.die("Database is not used in this test.") }),
);

const worktreeRoot = path.join(os.homedir(), ".angel-engine", "worktrees");
const alphaPath = path.join(worktreeRoot, "demo", "aaaaaaaa");
const betaPath = path.join(worktreeRoot, "demo", "bbbbbbbb");
const orphanPath = path.join(worktreeRoot, "demo", "cccccccc");

describe("scanManagedWorktrees", () => {
  it("groups every archived chat on a managed path into one eligible summary", async () => {
    const worktrees = await runEffect(
      scanManagedWorktrees(
        {},
        fakeDependencies({
          chats: [
            chat({ archived: true, cwd: alphaPath, id: "chat-1" }),
            chat({
              archived: true,
              cwd: path.join(alphaPath, "nested"),
              id: "chat-2",
              projectId: "project-1",
            }),
          ],
        }),
      ),
    );

    expect(worktrees).toEqual([
      {
        activeChatCount: 0,
        archivedChatCount: 2,
        chatCount: 2,
        chatIds: ["chat-1", "chat-2"],
        eligibleForCleanup: true,
        existsOnDisk: true,
        latestChatUpdatedAt: "2026-07-13T00:00:00.000Z",
        path: alphaPath,
        projectId: "project-1",
        projectSlug: "demo",
      },
    ]);
  });

  it("excludes a worktree with an active chat from the eligible list", async () => {
    const dependencies = fakeDependencies({
      chats: [
        chat({ archived: false, cwd: alphaPath, id: "chat-1" }),
        chat({ archived: true, cwd: alphaPath, id: "chat-2" }),
        chat({ archived: true, cwd: betaPath, id: "chat-3" }),
      ],
    });

    const all = await runEffect(scanManagedWorktrees({}, dependencies));
    expect(all.map((worktree) => worktree.path)).toEqual([alphaPath, betaPath]);
    expect(all[0]).toMatchObject({
      activeChatCount: 1,
      archivedChatCount: 1,
      eligibleForCleanup: false,
    });

    const eligible = await runEffect(
      scanManagedWorktrees({ eligibleOnly: true }, dependencies),
    );
    expect(eligible.map((worktree) => worktree.path)).toEqual([betaPath]);
  });

  it("includes an on-disk orphan with no chats", async () => {
    const worktrees = await runEffect(
      scanManagedWorktrees(
        { eligibleOnly: true },
        fakeDependencies({
          chats: [chat({ archived: true, cwd: alphaPath, id: "chat-1" })],
          onDisk: [alphaPath, orphanPath],
        }),
      ),
    );

    expect(worktrees.map((worktree) => worktree.path)).toEqual([
      alphaPath,
      orphanPath,
    ]);
    expect(worktrees[1]).toMatchObject({
      chatCount: 0,
      chatIds: [],
      eligibleForCleanup: true,
      latestChatUpdatedAt: null,
      projectId: null,
      projectSlug: "demo",
    });
  });

  it("ignores chats outside the managed worktree root", async () => {
    const worktrees = await runEffect(
      scanManagedWorktrees(
        {},
        fakeDependencies({
          chats: [
            chat({ archived: true, cwd: "/tmp/project", id: "chat-1" }),
            chat({ archived: true, cwd: null, id: "chat-2" }),
          ],
        }),
      ),
    );

    expect(worktrees).toEqual([]);
  });
});

describe("deleteManagedWorktrees", () => {
  it("deletes the chats and the worktree, and drops it from the next scan", async () => {
    const state = {
      chats: [
        chat({ archived: true, cwd: alphaPath, id: "chat-1" }),
        chat({ archived: true, cwd: alphaPath, id: "chat-2" }),
        chat({ archived: true, cwd: betaPath, id: "chat-3" }),
      ],
      onDisk: [alphaPath, betaPath],
    };
    const removed: string[] = [];
    const dependencies = fakeDependencies({
      ...state,
      deleteChats: (chatIds) =>
        Effect.sync(() => {
          state.chats = state.chats.filter(
            (target) => !chatIds.includes(target.id),
          );
        }),
      removeWorktree: (worktreePath) =>
        Effect.sync(() => {
          removed.push(worktreePath);
          state.onDisk = state.onDisk.filter((disk) => disk !== worktreePath);
          return worktreePath;
        }),
      state,
    });

    const result = await runEffect(
      Effect.flatMap(
        planManagedWorktreeDeletion({ paths: [alphaPath] }, dependencies),
        (targets) => executeManagedWorktreeDeletion(targets, dependencies),
      ),
    );

    expect(result).toEqual({
      deletedChatCount: 2,
      deletedChatIds: ["chat-1", "chat-2"],
      deletedWorktreeCount: 1,
      deletedWorktrees: [alphaPath],
    });
    expect(removed).toEqual([alphaPath]);

    const worktrees = await runEffect(scanManagedWorktrees({}, dependencies));
    expect(worktrees.map((worktree) => worktree.path)).toEqual([betaPath]);
  });

  it("deletes chats for a worktree already gone from disk", async () => {
    const dependencies = fakeDependencies({
      chats: [chat({ archived: true, cwd: alphaPath, id: "chat-1" })],
      onDisk: [],
      removeWorktree: () => Effect.succeed(undefined),
    });

    const result = await runEffect(
      Effect.flatMap(
        planManagedWorktreeDeletion({ paths: [alphaPath] }, dependencies),
        (targets) => executeManagedWorktreeDeletion(targets, dependencies),
      ),
    );

    expect(result).toEqual({
      deletedChatCount: 1,
      deletedChatIds: ["chat-1"],
      deletedWorktreeCount: 0,
      deletedWorktrees: [],
    });
  });

  it("rejects a worktree that regained an active chat after the scan", async () => {
    const dependencies = fakeDependencies({
      chats: [chat({ archived: false, cwd: alphaPath, id: "chat-1" })],
    });

    await expect(
      runEffect(
        planManagedWorktreeDeletion({ paths: [alphaPath] }, dependencies),
      ),
    ).rejects.toMatchObject({ code: "worktree-has-active-chats" });
  });

  it("rejects paths outside the managed worktree root", async () => {
    const dependencies = fakeDependencies({ chats: [] });

    for (const candidate of [
      "/tmp/project",
      worktreeRoot,
      path.join(worktreeRoot, "demo"),
      path.join(alphaPath, "..", "..", "..", "elsewhere"),
    ]) {
      await expect(
        runEffect(
          planManagedWorktreeDeletion({ paths: [candidate] }, dependencies),
        ),
      ).rejects.toMatchObject({ code: "worktree-not-managed" });
    }
  });

  it("rejects an empty path list", async () => {
    await expect(
      runEffect(
        planManagedWorktreeDeletion(
          { paths: [] },
          fakeDependencies({ chats: [] }),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid-request" });
  });
});

function chat(overrides: Partial<Chat> & Pick<Chat, "id">): Chat {
  return {
    archived: false,
    createdAt: "2026-07-13T00:00:00.000Z",
    cwd: null,
    pinned: false,
    projectId: null,
    remoteThreadId: null,
    runtime: "codex",
    title: "Test",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ...overrides,
  };
}

function fakeDependencies(options: {
  chats: Chat[];
  deleteChats?: ManagedWorktreeDependencies["deleteChats"];
  onDisk?: string[];
  removeWorktree?: ManagedWorktreeDependencies["removeWorktree"];
  state?: { chats: Chat[]; onDisk: string[] };
}): ManagedWorktreeDependencies {
  const state = options.state ?? {
    chats: options.chats,
    onDisk: options.onDisk ?? [],
  };
  // Tests that never mention the disk keep every managed path present.
  const tracksDisk = options.onDisk !== undefined;
  return {
    deleteChats: options.deleteChats ?? (() => Effect.void),
    listAllChats: () => Effect.sync(() => state.chats),
    listWorktreePathsOnDisk: () => Effect.sync(() => state.onDisk),
    pathExists: (worktreePath) =>
      !tracksDisk || state.onDisk.includes(worktreePath),
    removeWorktree:
      options.removeWorktree ??
      ((worktreePath) => Effect.succeed(worktreePath)),
  };
}

async function runEffect<A>(effect: Effect.Effect<A, DaemonError, Db>) {
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provide(testDbLayer)),
  );
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
