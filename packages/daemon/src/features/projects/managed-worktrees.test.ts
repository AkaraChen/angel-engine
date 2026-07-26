import type { Chat } from "@angel-engine/daemon-api/chat";
import type { ManagedWorktreeDeleteInput } from "@angel-engine/daemon-api/projects";

import os from "node:os";
import path from "node:path";
import { Cause, Effect, Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { Db } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
import {
  type ManagedWorktreeDependencies,
  deleteManagedWorktrees,
  scanManagedWorktrees,
} from "./managed-worktrees";

const closeChatSession = () => Effect.void;

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
      deleteManagedWorktrees(
        confirmedDeletion({
          chatIds: ["chat-1", "chat-2"],
          path: alphaPath,
        }),
        closeChatSession,
        dependencies,
      ),
    );

    expect(result).toEqual({
      deletedChatCount: 2,
      deletedChatIds: ["chat-1", "chat-2"],
      deletedWorktreeCount: 1,
      deletedWorktrees: [alphaPath],
      failedWorktrees: [],
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
      deleteManagedWorktrees(
        confirmedDeletion({
          chatIds: ["chat-1"],
          existsOnDisk: false,
          path: alphaPath,
        }),
        closeChatSession,
        dependencies,
      ),
    );

    expect(result).toEqual({
      deletedChatCount: 1,
      deletedChatIds: ["chat-1"],
      deletedWorktreeCount: 0,
      deletedWorktrees: [],
      failedWorktrees: [],
    });
  });

  it("rejects a worktree that regained an active chat after the scan", async () => {
    const dependencies = fakeDependencies({
      chats: [chat({ archived: false, cwd: alphaPath, id: "chat-1" })],
    });

    await expect(
      runEffect(
        deleteManagedWorktrees(
          confirmedDeletion({ chatIds: ["chat-1"], path: alphaPath }),
          closeChatSession,
          dependencies,
        ),
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
          deleteManagedWorktrees(
            confirmedDeletion({ chatIds: [], path: candidate }),
            closeChatSession,
            dependencies,
          ),
        ),
      ).rejects.toMatchObject({ code: "worktree-not-managed" });
    }
  });

  it("rejects an empty path list", async () => {
    await expect(
      runEffect(
        deleteManagedWorktrees(
          confirmedDeletion(),
          closeChatSession,
          fakeDependencies({ chats: [] }),
        ),
      ),
    ).rejects.toMatchObject({ code: "invalid-request" });
  });
});

describe("deleteManagedWorktrees ownership re-resolution", () => {
  it("rejects when an archived chat appears after confirmation", async () => {
    const state = { chats: [] as Chat[], onDisk: [alphaPath] };
    const closed: string[] = [];
    const deleted: string[] = [];
    const removed: string[] = [];
    const dependencies = fakeDependencies({
      chats: [],
      deleteChats: (chatIds) => Effect.sync(() => deleted.push(...chatIds)),
      onDisk: [alphaPath],
      removeWorktree: (worktreePath) =>
        Effect.sync(() => {
          removed.push(worktreePath);
          return worktreePath;
        }),
      state,
    });

    state.chats = [chat({ archived: true, cwd: alphaPath, id: "scanned" })];
    const scanned = await runEffect(scanManagedWorktrees({}, dependencies));
    expect(scanned[0]?.chatIds).toEqual(["scanned"]);

    // A chat is archived onto the same path between the scan and the delete.
    state.chats.push(chat({ archived: true, cwd: alphaPath, id: "late" }));

    await expect(
      runEffect(
        deleteManagedWorktrees(
          confirmedDeletion({ chatIds: ["scanned"], path: alphaPath }),
          (chatId) => Effect.sync(() => closed.push(chatId)),
          dependencies,
        ),
      ),
    ).rejects.toMatchObject({ code: "worktree-changed" });
    expect(closed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(removed).toEqual([]);
    expect(state.chats.map((target) => target.id)).toEqual(["scanned", "late"]);
  });

  it("rejects when the confirmed disk state changes", async () => {
    const state = {
      chats: [chat({ archived: true, cwd: alphaPath, id: "chat-1" })],
      onDisk: [alphaPath],
    };
    const closed: string[] = [];
    const deleted: string[] = [];
    const removed: string[] = [];
    const dependencies = fakeDependencies({
      ...state,
      deleteChats: (chatIds) => Effect.sync(() => deleted.push(...chatIds)),
      onDisk: state.onDisk,
      removeWorktree: (worktreePath) =>
        Effect.sync(() => {
          removed.push(worktreePath);
          return worktreePath;
        }),
      state,
    });

    const scanned = await runEffect(scanManagedWorktrees({}, dependencies));
    expect(scanned[0]?.existsOnDisk).toBe(true);
    state.onDisk = [];

    await expect(
      runEffect(
        deleteManagedWorktrees(
          confirmedDeletion({ chatIds: ["chat-1"], path: alphaPath }),
          (chatId) => Effect.sync(() => closed.push(chatId)),
          dependencies,
        ),
      ),
    ).rejects.toMatchObject({ code: "worktree-changed" });
    expect(closed).toEqual([]);
    expect(deleted).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("blocks the delete when a chat went active after the scan", async () => {
    const state = { chats: [] as Chat[], onDisk: [alphaPath] };
    const deleted: string[] = [];
    const removed: string[] = [];
    const dependencies = fakeDependencies({
      chats: [],
      deleteChats: (chatIds) => Effect.sync(() => deleted.push(...chatIds)),
      onDisk: [alphaPath],
      removeWorktree: (worktreePath) =>
        Effect.sync(() => {
          removed.push(worktreePath);
          return worktreePath;
        }),
      state,
    });

    state.chats = [chat({ archived: true, cwd: alphaPath, id: "archived" })];
    const scanned = await runEffect(
      scanManagedWorktrees({ eligibleOnly: true }, dependencies),
    );
    expect(scanned.map((worktree) => worktree.path)).toEqual([alphaPath]);

    state.chats.push(chat({ archived: false, cwd: alphaPath, id: "revived" }));

    await expect(
      runEffect(
        deleteManagedWorktrees(
          confirmedDeletion({ chatIds: ["archived"], path: alphaPath }),
          closeChatSession,
          dependencies,
        ),
      ),
    ).rejects.toMatchObject({ code: "worktree-has-active-chats" });
    expect(deleted).toEqual([]);
    expect(removed).toEqual([]);
  });

  it("rejects the whole request before mutating when one path is ineligible", async () => {
    const deleted: string[] = [];
    const dependencies = fakeDependencies({
      chats: [
        chat({ archived: true, cwd: alphaPath, id: "chat-1" }),
        chat({ archived: false, cwd: betaPath, id: "chat-2" }),
      ],
      deleteChats: (chatIds) => Effect.sync(() => deleted.push(...chatIds)),
    });

    await expect(
      runEffect(
        deleteManagedWorktrees(
          confirmedDeletion(
            { chatIds: ["chat-1"], path: alphaPath },
            { chatIds: ["chat-2"], path: betaPath },
          ),
          closeChatSession,
          dependencies,
        ),
      ),
    ).rejects.toMatchObject({ code: "worktree-has-active-chats" });
    expect(deleted).toEqual([]);
  });
});

describe("deleteManagedWorktrees partial failures", () => {
  it("reports a failed removal instead of hiding the chats it already deleted", async () => {
    const dependencies = fakeDependencies({
      chats: [
        chat({ archived: true, cwd: alphaPath, id: "chat-1" }),
        chat({ archived: true, cwd: betaPath, id: "chat-2" }),
      ],
      removeWorktree: (worktreePath) =>
        worktreePath === alphaPath
          ? Effect.fail(
              DaemonError.worktreeRemoveFailed(new Error("git is unhappy")),
            )
          : Effect.succeed(worktreePath),
    });

    const result = await runEffect(
      deleteManagedWorktrees(
        confirmedDeletion(
          { chatIds: ["chat-1"], path: alphaPath },
          { chatIds: ["chat-2"], path: betaPath },
        ),
        closeChatSession,
        dependencies,
      ),
    );

    // chat-1 is gone from the database, so the caller must still publish it.
    expect(result).toEqual({
      deletedChatCount: 2,
      deletedChatIds: ["chat-1", "chat-2"],
      deletedWorktreeCount: 1,
      deletedWorktrees: [betaPath],
      failedWorktrees: [{ error: "git is unhappy", path: alphaPath }],
    });
  });

  it("keeps deleting the remaining paths when a chat delete fails", async () => {
    const dependencies = fakeDependencies({
      chats: [
        chat({ archived: true, cwd: alphaPath, id: "chat-1" }),
        chat({ archived: true, cwd: betaPath, id: "chat-2" }),
      ],
      deleteChats: (chatIds) =>
        chatIds.includes("chat-1")
          ? Effect.fail(
              DaemonError.databaseFailed(new Error("locked"), "locked"),
            )
          : Effect.void,
    });

    const result = await runEffect(
      deleteManagedWorktrees(
        confirmedDeletion(
          { chatIds: ["chat-1"], path: alphaPath },
          { chatIds: ["chat-2"], path: betaPath },
        ),
        closeChatSession,
        dependencies,
      ),
    );

    expect(result).toMatchObject({
      deletedChatIds: ["chat-2"],
      deletedWorktrees: [betaPath],
      failedWorktrees: [{ error: "locked", path: alphaPath }],
    });
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

function confirmedDeletion(
  ...targets: {
    chatIds: string[];
    existsOnDisk?: boolean;
    path: string;
  }[]
): ManagedWorktreeDeleteInput {
  return {
    targets: targets.map(
      ({ chatIds, existsOnDisk = true, path: worktreePath }) => ({
        expectedChatIds: chatIds,
        expectedExistsOnDisk: existsOnDisk,
        path: worktreePath,
      }),
    ),
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
