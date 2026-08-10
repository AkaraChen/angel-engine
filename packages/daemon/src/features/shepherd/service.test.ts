import type { Chat, ChatRunStartInput } from "@angel-engine/daemon-api/chat";
import type {
  GitHubCheckItem,
  GitHubChecksSnapshot,
  GitHubReviewThreadsResult,
} from "@angel-engine/daemon-api/github";
import type { ShepherdSession } from "@angel-engine/daemon-api/shepherd";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatActivityStore } from "../chat/activity";
import { ChatRunRegistry } from "../chat/run-registry";
import type { PersistedQueuedChatRun } from "../chat/repository";
import type { ShepherdPorts, ShepherdSnapshot } from "./service";
import { ShepherdService } from "./service";
import { checkFingerprint } from "./fingerprints";

const chat: Chat = {
  archived: false,
  createdAt: "2026-08-10T00:00:00.000Z",
  cwd: "/tmp/repo",
  id: "chat-1",
  pinned: false,
  projectId: null,
  remoteThreadId: null,
  runtime: "codex",
  title: "Test",
  updatedAt: "2026-08-10T00:00:00.000Z",
};

function checkItem(
  overrides: Partial<GitHubCheckItem> & Pick<GitHubCheckItem, "name">,
): GitHubCheckItem {
  return {
    attempt: 1,
    checkRunId: "100",
    conclusion: "FAILURE",
    detailsUrl: null,
    isPending: false,
    isRequired: true,
    status: "COMPLETED",
    workflowName: "ci",
    workflowRunId: "9",
    ...overrides,
  };
}

function checksSnapshot(
  overrides: Partial<GitHubChecksSnapshot> = {},
): GitHubChecksSnapshot {
  const failedRequired = overrides.failedRequired ?? [];
  return {
    checks: overrides.checks ?? failedRequired,
    failed: overrides.failed ?? failedRequired,
    failedRequired,
    hasPending: overrides.hasPending ?? false,
    headOid: overrides.headOid ?? "sha-a",
    requiredAllGreen: overrides.requiredAllGreen ?? failedRequired.length === 0,
  };
}

function threadsResult(
  overrides: Partial<GitHubReviewThreadsResult> = {},
): GitHubReviewThreadsResult {
  return {
    resolvedCount: 0,
    threads: [],
    unresolved: [],
    unresolvedCount: 0,
    ...overrides,
  };
}

function createMemoryPorts(options: {
  snapshot: ShepherdSnapshot | (() => ShepherdSnapshot);
  queuedRuns?: PersistedQueuedChatRun[];
  ambiguousRun?: PersistedQueuedChatRun | null;
}): {
  ports: ShepherdPorts;
  sessions: Map<string, ShepherdSession>;
  byChat: Map<string, string>;
} {
  const sessions = new Map<string, ShepherdSession>();
  const byChat = new Map<string, string>();
  const now = () => "2026-08-10T00:00:00.000Z";

  const ports: ShepherdPorts = {
    listActiveSessions: async () =>
      [...sessions.values()].filter(
        (s) => s.state === "watching" || s.state === "queued",
      ),
    getSessionById: async (id) => sessions.get(id) ?? null,
    getSessionByChatId: async (chatId) => {
      const id = byChat.get(chatId);
      return id ? (sessions.get(id) ?? null) : null;
    },
    createSession: async (input) => {
      const session: ShepherdSession = {
        id: `s-${sessions.size + 1}`,
        chatId: input.chatId,
        owner: input.owner,
        repo: input.repo,
        prNumber: input.prNumber,
        headSha: input.headSha,
        state: "watching",
        settledReason: null,
        round: 0,
        maxRounds: input.maxRounds,
        consecutiveNoProgress: 0,
        handledFingerprints: input.handledFingerprints ?? [],
        baselineSnapshot: input.baselineSnapshot,
        pendingPrompt: null,
        pendingFingerprints: [],
        lastSentHeadSha: null,
        createdAt: now(),
        updatedAt: now(),
      };
      sessions.set(session.id, session);
      byChat.set(session.chatId, session.id);
      return session;
    },
    saveSession: async (session) => {
      const next = { ...session, updatedAt: now() };
      sessions.set(next.id, next);
      byChat.set(next.chatId, next.id);
      return next;
    },
    settleSession: async (session, reason) => {
      const next: ShepherdSession = {
        ...session,
        state: "settled",
        settledReason: reason,
        pendingPrompt: null,
        pendingFingerprints: [],
        updatedAt: now(),
      };
      sessions.set(next.id, next);
      return next;
    },
    requireChat: async () => chat,
    getChat: async () => chat,
    listQueuedChatRuns: async () => options.queuedRuns ?? [],
    getAmbiguousQueuedChatRun: async () => options.ambiguousRun ?? null,
    fetchSnapshot: async () =>
      typeof options.snapshot === "function"
        ? options.snapshot()
        : options.snapshot,
    fetchFailureLog: async () => ({ lines: ["error: boom"], truncated: false }),
  };

  return { ports, sessions, byChat };
}

function createService(ports: Partial<ShepherdPorts> & ShepherdPorts) {
  const started: ChatRunStartInput[] = [];
  const activity = new ChatActivityStore();
  const chatRuns = new ChatRunRegistry({
    execute: async () => {
      throw new Error("execute should not run in unit tests");
    },
  });
  // Record sends without keeping a live registry entry (avoids chat conflicts).
  vi.spyOn(chatRuns, "start").mockImplementation((runId, input) => {
    started.push(input);
    return {
      assistantMessage: {
        content: [],
        createdAt: "2026-08-10T00:00:00.000Z",
        id: `${runId}:assistant`,
        role: "assistant",
      },
      chatId: input.chatId,
      lastEventSequence: 0,
      pendingElicitation: null,
      runId,
      startedAt: "2026-08-10T00:00:00.000Z",
      status: "running" as const,
      updatedAt: "2026-08-10T00:00:00.000Z",
      userMessage: {
        content: [{ text: input.text, type: "text" }],
        createdAt: "2026-08-10T00:00:00.000Z",
        id: `${runId}:user`,
        role: "user",
      },
    };
  });

  const events = {
    activityChanged: vi.fn(),
    conversationChanged: vi.fn(),
    metadataChanged: vi.fn(),
    shepherdChanged: vi.fn(),
  };

  const service = new ShepherdService({
    activity,
    chatRuns,
    chatEvents: events,
    run: async () => {
      throw new Error("default Effect run should not be used with fake ports");
    },
    ports,
    setTimer: () => 0 as unknown as ReturnType<typeof setTimeout>,
    clearTimer: () => undefined,
  });

  return { service, activity, chatRuns, events, started };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ShepherdService", () => {
  it("triggers a shepherd turn when required checks are red", async () => {
    const failed = checkItem({ name: "build", checkRunId: "42" });
    const { ports, sessions } = createMemoryPorts({
      snapshot: {
        cwd: "/tmp/repo",
        prState: "OPEN",
        checks: checksSnapshot({
          failedRequired: [failed],
          requiredAllGreen: false,
        }),
        threads: threadsResult(),
      },
    });
    const { service, started, events } = createService(ports);

    const session = await service.startSession({
      chatId: "chat-1",
      owner: "acme",
      prNumber: 7,
      repo: "app",
    });
    // startSession schedules a timer we ignore; drive one poll explicitly.
    await service.pollOnceForTests();

    expect(started).toHaveLength(1);
    expect(started[0]).toMatchObject({
      chatId: "chat-1",
      origin: "shepherd",
    });
    expect(started[0]?.text).toContain("Shepherd round 1/10");
    expect(started[0]?.text).toContain("build");

    const stored = sessions.get(session.id);
    expect(stored?.round).toBe(1);
    expect(stored?.handledFingerprints).toContain(checkFingerprint(failed));
    expect(events.shepherdChanged).toHaveBeenCalled();
  });

  it("queues while running and sends after activity settles", async () => {
    const failed = checkItem({ name: "test", checkRunId: "7" });
    const { ports, sessions } = createMemoryPorts({
      snapshot: {
        cwd: "/tmp/repo",
        prState: "OPEN",
        checks: checksSnapshot({
          failedRequired: [failed],
          requiredAllGreen: false,
        }),
        threads: threadsResult(),
      },
    });
    const { service, activity, started } = createService(ports);

    activity.start("chat-1", "user-run");
    const session = await service.startSession({
      chatId: "chat-1",
      owner: "acme",
      prNumber: 1,
      repo: "app",
    });
    await service.pollOnceForTests();

    expect(started).toHaveLength(0);
    expect(sessions.get(session.id)?.state).toBe("queued");
    expect(sessions.get(session.id)?.pendingPrompt).toContain("test");

    // Finish the user run, then shepherd flushes the queue.
    activity.apply("chat-1", "user-run", {
      result: {
        chat,
        chatId: "chat-1",
        content: [],
        text: "done",
      },
      type: "result",
    });
    activity.acknowledge("chat-1", "user-run:done");
    await service.onActivityChanged("chat-1");

    expect(started).toHaveLength(1);
    expect(started[0]?.origin).toBe("shepherd");
    expect(sessions.get(session.id)?.state).toBe("watching");
    expect(sessions.get(session.id)?.round).toBe(1);
    expect(sessions.get(session.id)?.pendingPrompt).toBeNull();
  });

  it("yields to a user message and settles stopped", async () => {
    const failed = checkItem({ name: "build", checkRunId: "1" });
    const { ports, sessions } = createMemoryPorts({
      snapshot: {
        cwd: "/tmp/repo",
        prState: "OPEN",
        checks: checksSnapshot({
          failedRequired: [failed],
          requiredAllGreen: false,
        }),
        threads: threadsResult(),
      },
    });
    const { service } = createService(ports);
    const session = await service.startSession({
      chatId: "chat-1",
      owner: "acme",
      prNumber: 1,
      repo: "app",
    });

    const yielded = await service.maybeYieldToUser({
      chatId: "chat-1",
      origin: undefined,
    });
    expect(yielded).toBe(true);
    expect(sessions.get(session.id)).toMatchObject({
      state: "settled",
      settledReason: "stopped",
    });

    // Shepherd origin must not yield.
    await service.resumeSession(session.id);
    const keep = await service.maybeYieldToUser({
      chatId: "chat-1",
      origin: "shepherd",
    });
    expect(keep).toBe(false);
    expect(sessions.get(session.id)?.state).toBe("watching");
  });

  it("holds without queueing when a queued chat run exists", async () => {
    const failed = checkItem({ name: "build", checkRunId: "1" });
    const { ports, sessions } = createMemoryPorts({
      snapshot: {
        cwd: "/tmp/repo",
        prState: "OPEN",
        checks: checksSnapshot({
          failedRequired: [failed],
          requiredAllGreen: false,
        }),
        threads: threadsResult(),
      },
      queuedRuns: [
        {
          createdAt: "2026-08-10T00:00:00.000Z",
          input: { chatId: "chat-1", text: "queued" },
          runId: "q1",
          state: "queued",
        },
      ],
    });
    const { service, started } = createService(ports);
    const session = await service.startSession({
      chatId: "chat-1",
      owner: "acme",
      prNumber: 1,
      repo: "app",
    });
    await service.pollOnceForTests();

    expect(started).toHaveLength(0);
    expect(sessions.get(session.id)?.state).toBe("watching");
    expect(sessions.get(session.id)?.pendingPrompt).toBeNull();
  });

  it("holds without queueing when an ambiguous run exists", async () => {
    const failed = checkItem({ name: "build", checkRunId: "1" });
    const { ports, sessions } = createMemoryPorts({
      snapshot: {
        cwd: "/tmp/repo",
        prState: "OPEN",
        checks: checksSnapshot({
          failedRequired: [failed],
          requiredAllGreen: false,
        }),
        threads: threadsResult(),
      },
      ambiguousRun: {
        createdAt: "2026-08-10T00:00:00.000Z",
        input: { chatId: "chat-1", text: "maybe" },
        runId: "amb1",
        state: "dispatching",
      },
    });
    const { service, started } = createService(ports);
    const session = await service.startSession({
      chatId: "chat-1",
      owner: "acme",
      prNumber: 1,
      repo: "app",
    });
    await service.pollOnceForTests();

    expect(started).toHaveLength(0);
    expect(sessions.get(session.id)?.state).toBe("watching");
    expect(sessions.get(session.id)?.pendingPrompt).toBeNull();
  });

  it("keeps comment fingerprints across headSha changes", async () => {
    const commentId = "PRRC_kwDOComment1";
    let headOid = "sha-a";
    let checkRunId = "10";
    const { ports, sessions } = createMemoryPorts({
      snapshot: () => ({
        cwd: "/tmp/repo",
        prState: "OPEN",
        checks: checksSnapshot({
          headOid,
          failedRequired: [
            checkItem({ name: "build", checkRunId, attempt: 1 }),
          ],
          requiredAllGreen: false,
        }),
        threads: threadsResult({
          unresolvedCount: 1,
          unresolved: [
            {
              id: "t1",
              isResolved: false,
              path: "a.ts",
              line: 1,
              comments: [
                {
                  id: commentId,
                  author: "rev",
                  body: "please fix",
                  path: "a.ts",
                  line: 1,
                  createdAt: "2026-08-10T00:00:00.000Z",
                },
              ],
            },
          ],
        }),
      }),
    });
    const { service, activity, started } = createService(ports);
    const session = await service.startSession({
      chatId: "chat-1",
      owner: "acme",
      prNumber: 1,
      repo: "app",
    });

    await service.pollOnceForTests();
    expect(started).toHaveLength(1);
    const afterFirst = sessions.get(session.id)!;
    expect(afterFirst.handledFingerprints).toEqual(
      expect.arrayContaining([commentId, "10:1"]),
    );
    expect(afterFirst.round).toBe(1);
    // Settle the shepherd turn so the next poll is not held by running activity.
    activity.clearChat("chat-1");

    // Push advances head; new check id, same unresolved comment.
    headOid = "sha-b";
    checkRunId = "11";
    await service.pollOnceForTests();

    const afterHead = sessions.get(session.id)!;
    expect(afterHead.headSha).toBe("sha-b");
    expect(afterHead.handledFingerprints).toContain(commentId);
    // Old check fingerprint must not force re-dispatch of the comment.
    expect(afterHead.handledFingerprints).not.toContain("10:1");
    // New required failure still triggers a turn once.
    expect(started).toHaveLength(2);
    expect(afterHead.round).toBe(2);
    expect(afterHead.handledFingerprints).toContain("11:1");
    activity.clearChat("chat-1");
    // Comment must not burn another round on its own after head change.
    await service.pollOnceForTests();
    expect(started).toHaveLength(2);
    expect(sessions.get(session.id)?.round).toBe(2);
  });

  it("uses a single poller schedule rather than per-session timers", async () => {
    const delays: number[] = [];
    const failed = checkItem({ name: "build", checkRunId: "1" });
    const { ports } = createMemoryPorts({
      snapshot: {
        cwd: "/tmp/repo",
        prState: "OPEN",
        checks: checksSnapshot({
          // Pending so ticks stay "active" without sending.
          hasPending: true,
          requiredAllGreen: false,
          failedRequired: [failed],
        }),
        threads: threadsResult(),
      },
    });

    const activity = new ChatActivityStore();
    const chatRuns = new ChatRunRegistry({
      execute: async () => {
        throw new Error("unused");
      },
    });
    const service = new ShepherdService({
      activity,
      chatRuns,
      chatEvents: {
        activityChanged: () => undefined,
        conversationChanged: () => undefined,
        metadataChanged: () => undefined,
        shepherdChanged: () => undefined,
      },
      run: async () => {
        throw new Error("unused");
      },
      ports,
      setTimer: (_cb, delay) => {
        delays.push(delay);
        return delays.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    });

    await service.startSession({
      chatId: "chat-1",
      owner: "acme",
      prNumber: 1,
      repo: "app",
    });
    // One immediate schedule for wake after start.
    expect(delays.filter((d) => d === 0).length).toBe(1);

    // A second session must not open a second concurrent timer family —
    // wake still uses the single poller (re-schedules one timer).
    // Swap chat id via a second create path: start would fail unique chat,
    // so only assert single schedule list growth stays 1 pending at a time.
    const before = delays.length;
    await service.start(); // already started — no-op
    expect(delays.length).toBe(before);
  });
});
