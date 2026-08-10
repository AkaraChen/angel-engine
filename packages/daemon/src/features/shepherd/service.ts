import type { Chat, ChatRunStartInput } from "@angel-engine/daemon-api/chat";
import type {
  GitHubChecksSnapshot,
  GitHubFailureLogResult,
  GitHubReviewThreadsResult,
} from "@angel-engine/daemon-api/github";
import type {
  ShepherdHoldReason,
  ShepherdSession,
  ShepherdSettledReason,
  ShepherdStartInput,
} from "@angel-engine/daemon-api/shepherd";
import { DEFAULT_SHEPHERD_MAX_ROUNDS } from "@angel-engine/daemon-api/shepherd";
import { randomUUID } from "node:crypto";
import is from "@sindresorhus/is";
import { Effect } from "effect";

import type { ChatActivityStore } from "../chat/activity";
import type { ChatEventsApi } from "../chat/chat-events";
import type { ChatRunRegistry } from "../chat/run-registry";
import type { Db } from "../../platform/db";
import type { DaemonError } from "../../platform/errors";
import type { GhRunner } from "../github/gh-cli";
import type { CreateShepherdSessionInput } from "./store";
import type { PersistedQueuedChatRun } from "../chat/repository";

import { getChat, requireChat } from "../chat/repository";
import {
  getAmbiguousQueuedChatRun,
  listQueuedChatRuns,
} from "../chat/repository";
import { fetchGitHubChecks } from "../github/checks-snapshot";
import { fetchGitHubFailureLog } from "../github/failure-log";
import { viewPullRequest } from "../github/pull-requests";
import { fetchGitHubReviewThreads } from "../github/review-threads";
import { DaemonError as DE } from "../../platform/errors";
import { evaluateShepherdTick, progressAfterShepherdTurn } from "./evaluate";
import { evaluateShepherdGate, isShepherdYieldOrigin } from "./gate";
import { retainCommentFingerprints } from "./fingerprints";
import { buildShepherdPrompt, collectNewComments } from "./prompt";
import {
  createShepherdSession,
  getShepherdSessionByChatId,
  getShepherdSessionById,
  listActiveShepherdSessions,
  saveShepherdSession,
  settleShepherdSession,
} from "./store";

export const ACTIVE_POLL_MS = 30_000;
export const IDLE_POLL_MS = 120_000;

export interface ShepherdSnapshot {
  checks: GitHubChecksSnapshot;
  threads: GitHubReviewThreadsResult;
  prState: string | null;
  cwd: string;
}

/**
 * Side-effect ports. Production wires Effect/DB/gh; tests inject fakes.
 */
export interface ShepherdPorts {
  listActiveSessions: () => Promise<ShepherdSession[]>;
  getSessionById: (id: string) => Promise<ShepherdSession | null>;
  getSessionByChatId: (chatId: string) => Promise<ShepherdSession | null>;
  createSession: (
    input: CreateShepherdSessionInput,
  ) => Promise<ShepherdSession>;
  saveSession: (session: ShepherdSession) => Promise<ShepherdSession>;
  settleSession: (
    session: ShepherdSession,
    reason: ShepherdSettledReason,
  ) => Promise<ShepherdSession>;
  requireChat: (chatId: string) => Promise<Chat>;
  getChat: (chatId: string) => Promise<Chat | null>;
  listQueuedChatRuns: () => Promise<PersistedQueuedChatRun[]>;
  getAmbiguousQueuedChatRun: (
    chatId: string,
  ) => Promise<PersistedQueuedChatRun | null>;
  fetchSnapshot: (input: {
    cwd: string;
    owner: string;
    prNumber: number;
    repo: string;
  }) => Promise<ShepherdSnapshot>;
  fetchFailureLog: (input: {
    cwd: string;
    runId: string;
    repo: string;
  }) => Promise<GitHubFailureLogResult>;
}

export interface ShepherdServiceDeps {
  activity: ChatActivityStore;
  chatRuns: ChatRunRegistry;
  chatEvents: ChatEventsApi;
  run: <A>(effect: Effect.Effect<A, DaemonError, Db>) => Promise<A>;
  ports?: Partial<ShepherdPorts>;
  runGh?: GhRunner;
  whichGh?: () => Promise<string | null>;
  setTimer?: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

type SessionTickResult = "active" | "idle" | "gone";

/**
 * Owns shepherd lifecycle: start/stop/resume, a single daemon poller, gate,
 * and auto-sends. Pure evaluation lives in `evaluate.ts` / `gate.ts`.
 */
export class ShepherdService {
  readonly #activity: ChatActivityStore;
  readonly #chatRuns: ChatRunRegistry;
  readonly #chatEvents: ChatEventsApi;
  readonly #ports: ShepherdPorts;
  readonly #setTimer: NonNullable<ShepherdServiceDeps["setTimer"]>;
  readonly #clearTimer: NonNullable<ShepherdServiceDeps["clearTimer"]>;
  /** Last projected hold reason published per chat — avoids poll spam. */
  readonly #publishedHold = new Map<string, ShepherdHoldReason | null>();

  /** One daemon-level poller for all watching/queued sessions. */
  #pollTimer: ReturnType<typeof setTimeout> | undefined;
  #pollRunning = false;
  #started = false;

  /** chatIds whose last shepherd send we are waiting to finish for progress. */
  readonly #awaitingProgress = new Map<
    string,
    { sessionId: string; origin: "shepherd" }
  >();

  constructor(deps: ShepherdServiceDeps) {
    this.#activity = deps.activity;
    this.#chatRuns = deps.chatRuns;
    this.#chatEvents = deps.chatEvents;
    this.#setTimer = deps.setTimer ?? setTimeout;
    this.#clearTimer = deps.clearTimer ?? clearTimeout;
    this.#ports = createDefaultPorts(deps);
  }

  /** Restore watching/queued sessions after daemon boot. */
  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    // Immediate pass over restored sessions, then the single poller continues.
    this.#schedulePoll(0);
  }

  stopAll(): void {
    this.#clearPollTimer();
    this.#started = false;
  }

  async getByChatId(chatId: string): Promise<ShepherdSession | null> {
    const session = await this.#ports.getSessionByChatId(chatId);
    if (session === null) return null;
    return this.#projectHoldReason(session);
  }

  async startSession(input: ShepherdStartInput): Promise<ShepherdSession> {
    const chat = await this.#ports.requireChat(input.chatId);
    const cwd = requireChatCwd(chat.cwd);
    const existing = await this.#ports.getSessionByChatId(input.chatId);
    if (
      existing &&
      (existing.state === "watching" || existing.state === "queued")
    ) {
      throw DE.invalidRequest("This chat already has an active shepherd.");
    }

    const maxRounds =
      typeof input.maxRounds === "number" &&
      Number.isInteger(input.maxRounds) &&
      input.maxRounds > 0
        ? input.maxRounds
        : DEFAULT_SHEPHERD_MAX_ROUNDS;

    const snapshot = await this.#ports.fetchSnapshot({
      cwd,
      owner: input.owner,
      prNumber: input.prNumber,
      repo: input.repo,
    });

    // Fingerprints start empty so an already-red PR still triggers a first turn.
    let session: ShepherdSession;
    if (existing) {
      session = await this.#ports.saveSession({
        ...existing,
        owner: input.owner,
        repo: input.repo,
        prNumber: input.prNumber,
        headSha: snapshot.checks.headOid,
        state: "watching",
        settledReason: null,
        holdReason: null,
        round: 0,
        maxRounds,
        consecutiveNoProgress: 0,
        handledFingerprints: [],
        baselineSnapshot: {
          checks: snapshot.checks,
          unresolvedCount: snapshot.threads.unresolvedCount,
        },
        pendingPrompt: null,
        pendingFingerprints: [],
        lastSentHeadSha: null,
      });
    } else {
      session = await this.#ports.createSession({
        chatId: input.chatId,
        owner: input.owner,
        repo: input.repo,
        prNumber: input.prNumber,
        maxRounds,
        headSha: snapshot.checks.headOid,
        baselineSnapshot: {
          checks: snapshot.checks,
          unresolvedCount: snapshot.threads.unresolvedCount,
        },
        handledFingerprints: [],
      });
    }

    this.#publish(session.chatId);
    this.#ensureStarted();
    this.#schedulePoll(0);
    return session;
  }

  async stopSession(id: string): Promise<ShepherdSession> {
    const session = await this.#requireSession(id);
    if (
      session.state === "settled" &&
      (session.settledReason === "stopped" ||
        session.settledReason === "yielded")
    ) {
      return { ...session, holdReason: null };
    }
    const next = await this.#ports.settleSession(session, "stopped");
    this.#awaitingProgress.delete(session.chatId);
    this.#publish(next.chatId);
    return { ...next, holdReason: null };
  }

  async resumeSession(id: string): Promise<ShepherdSession> {
    const session = await this.#requireSession(id);
    if (
      session.state !== "settled" ||
      (session.settledReason !== "stopped" &&
        session.settledReason !== "yielded")
    ) {
      throw DE.invalidRequest(
        "Only a stopped or yielded shepherd session can be resumed.",
      );
    }
    const next = await this.#ports.saveSession({
      ...session,
      state: "watching",
      settledReason: null,
      holdReason: null,
      pendingPrompt: null,
      pendingFingerprints: [],
    });
    this.#publish(next.chatId);
    this.#ensureStarted();
    this.#schedulePoll(0);
    return this.#projectHoldReason(next);
  }

  /**
   * User send yield: non-shepherd origin + active session → settled/yielded.
   * Distinct from manual stop (`settled/stopped`) so the UI can toast resume.
   * Returns true when yield happened.
   *
   * Swallows store failures so chat-send paths still work when the DB is not
   * available (test harnesses, startup races).
   */
  async maybeYieldToUser(input: {
    chatId: string | undefined;
    origin: string | undefined;
  }): Promise<boolean> {
    if (!is.nonEmptyString(input.chatId)) return false;
    if (!isShepherdYieldOrigin(input.origin)) return false;
    try {
      const session = await this.#ports.getSessionByChatId(input.chatId);
      if (
        session === null ||
        (session.state !== "watching" && session.state !== "queued")
      ) {
        return false;
      }
      await this.#ports.settleSession(session, "yielded");
      this.#awaitingProgress.delete(session.chatId);
      this.#publish(session.chatId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Called when chat activity changes — flush queued shepherd sends and track
   * no-progress after a shepherd turn completes.
   */
  async onActivityChanged(chatId: string): Promise<void> {
    const session = await this.#ports.getSessionByChatId(chatId);
    if (session === null) return;

    const awaiting = this.#awaitingProgress.get(chatId);
    if (awaiting && awaiting.sessionId === session.id) {
      const activity = this.#activity.get(chatId);
      if (
        activity === null ||
        activity.status === "done" ||
        activity.status === "failed"
      ) {
        this.#awaitingProgress.delete(chatId);
        await this.#recordProgress(session);
      }
    }

    if (session.state === "queued") {
      await this.#tryFlushQueued(session.id);
    }
  }

  /** Test helper: run one poll cycle immediately (does not reschedule). */
  async pollOnceForTests(): Promise<void> {
    await this.#pollAll({ reschedule: false });
  }

  #ensureStarted(): void {
    if (!this.#started) this.#started = true;
  }

  #schedulePoll(delayMs: number): void {
    if (!this.#started) return;
    this.#clearPollTimer();
    this.#pollTimer = this.#setTimer(() => {
      this.#pollTimer = undefined;
      void this.#pollAll({ reschedule: true }).catch(() => {
        // Keep quiet; #pollAll already parks on failure.
      });
    }, delayMs);
  }

  #clearPollTimer(): void {
    if (this.#pollTimer === undefined) return;
    this.#clearTimer(this.#pollTimer);
    this.#pollTimer = undefined;
  }

  async #pollAll(options: { reschedule: boolean }): Promise<void> {
    if (this.#pollRunning) {
      if (options.reschedule) this.#schedulePoll(ACTIVE_POLL_MS);
      return;
    }
    this.#pollRunning = true;
    let nextDelay = IDLE_POLL_MS;
    let shouldReschedule = options.reschedule;
    try {
      const sessions = await this.#ports.listActiveSessions();
      if (sessions.length === 0) {
        // No active sessions — stop the poller until start/resume wakes it.
        shouldReschedule = false;
        return;
      }

      let anyActive = false;
      for (const session of sessions) {
        const result = await this.#tickSession(session.id);
        if (result === "active") anyActive = true;
      }
      nextDelay = anyActive ? ACTIVE_POLL_MS : IDLE_POLL_MS;
    } catch {
      // Store/gh failures: park the poller instead of spinning forever.
      shouldReschedule = false;
    } finally {
      this.#pollRunning = false;
      if (shouldReschedule) {
        try {
          const stillActive = await this.#ports.listActiveSessions();
          if (stillActive.length > 0) {
            this.#schedulePoll(nextDelay);
          }
        } catch {
          // leave poller idle until the next explicit wake
        }
      }
    }
  }

  async #tickSession(sessionId: string): Promise<SessionTickResult> {
    const session = await this.#ports.getSessionById(sessionId);
    if (
      session === null ||
      (session.state !== "watching" && session.state !== "queued")
    ) {
      return "gone";
    }

    const chat = await this.#ports.getChat(session.chatId);
    if (chat === null || !is.nonEmptyString(chat.cwd)) {
      const settled = await this.#ports.settleSession(session, "blocked");
      this.#publish(settled.chatId);
      return "gone";
    }

    const snapshot = await this.#ports.fetchSnapshot({
      cwd: chat.cwd,
      owner: session.owner,
      prNumber: session.prNumber,
      repo: session.repo,
    });

    const decision = evaluateShepherdTick({
      session,
      checks: snapshot.checks,
      threads: snapshot.threads,
      prState: snapshot.prState,
    });

    switch (decision.kind) {
      case "pending":
        return "active";
      case "head_changed": {
        // Invalidate check/baseline state only — keep comment fingerprints so
        // unresolved review comments do not re-fire and burn a round after push.
        const next = await this.#ports.saveSession({
          ...session,
          headSha: decision.headSha,
          consecutiveNoProgress: 0,
          handledFingerprints: retainCommentFingerprints(
            session.handledFingerprints,
          ),
          pendingFingerprints: [],
          pendingPrompt: null,
          baselineSnapshot: {
            checks: snapshot.checks,
            unresolvedCount: snapshot.threads.unresolvedCount,
          },
          state: session.state === "queued" ? "watching" : session.state,
        });
        this.#publish(next.chatId);
        // Re-evaluate the same session immediately within this poll pass.
        return this.#tickSession(sessionId);
      }
      case "settle": {
        const next = await this.#ports.settleSession(session, decision.reason);
        this.#publish(next.chatId);
        return "gone";
      }
      case "noop":
        return "idle";
      case "dispatch": {
        await this.#handleDispatch(session, snapshot, decision);
        return "active";
      }
    }
  }

  async #handleDispatch(
    session: ShepherdSession,
    snapshot: ShepherdSnapshot,
    decision: Extract<
      ReturnType<typeof evaluateShepherdTick>,
      { kind: "dispatch" }
    >,
  ): Promise<void> {
    const unhandledCommentIds = new Set(decision.newCommentIds);
    const newComments = collectNewComments(
      snapshot.threads.unresolved,
      unhandledCommentIds,
    );

    const failureLogs: {
      checkName: string;
      log: GitHubFailureLogResult;
    }[] = [];
    for (const check of decision.failedRequired) {
      if (!is.nonEmptyString(check.workflowRunId)) continue;
      const log = await this.#ports.fetchFailureLog({
        cwd: snapshot.cwd,
        runId: check.workflowRunId,
        repo: `${session.owner}/${session.repo}`,
      });
      failureLogs.push({ checkName: check.name, log });
    }

    const nextRound = session.round + 1;
    const freshPrompt = buildShepherdPrompt({
      round: nextRound,
      maxRounds: session.maxRounds,
      failedRequired: decision.failedRequired,
      newComments,
      failureLogs,
    });

    const mergedFingerprints = uniqueStrings([
      ...session.pendingFingerprints,
      ...decision.fingerprints,
    ]);
    const mergedPrompt =
      session.pendingPrompt !== null && session.state === "queued"
        ? `${session.pendingPrompt}\n---\n${freshPrompt}`
        : freshPrompt;

    const gate = await this.#gateFor(session.chatId);
    if (gate.action === "hold") {
      // Stay watching; do not stage fingerprints so we re-evaluate later.
      // Publish only when the projected hold reason changes.
      this.#publishHoldChange(session.chatId, gate.reason);
      return;
    }
    this.#publishHoldChange(session.chatId, null);

    if (gate.action === "queue") {
      const next = await this.#ports.saveSession({
        ...session,
        state: "queued",
        holdReason: null,
        pendingPrompt: mergedPrompt,
        pendingFingerprints: mergedFingerprints,
        headSha: snapshot.checks.headOid ?? session.headSha,
      });
      this.#publish(next.chatId);
      return;
    }

    await this.#sendShepherdTurn({
      session,
      prompt: mergedPrompt,
      fingerprints: mergedFingerprints,
      headSha: snapshot.checks.headOid,
      nextRound,
    });
  }

  async #tryFlushQueued(sessionId: string): Promise<void> {
    const session = await this.#ports.getSessionById(sessionId);
    if (
      session === null ||
      session.state !== "queued" ||
      !is.nonEmptyString(session.pendingPrompt)
    ) {
      return;
    }
    const gate = await this.#gateFor(session.chatId);
    if (gate.action !== "send") return;

    await this.#sendShepherdTurn({
      session,
      prompt: session.pendingPrompt,
      fingerprints: session.pendingFingerprints,
      headSha: session.headSha,
      nextRound: session.round + 1,
    });
  }

  async #sendShepherdTurn(input: {
    session: ShepherdSession;
    prompt: string;
    fingerprints: string[];
    headSha: string | null;
    nextRound: number;
  }): Promise<void> {
    const { session, prompt, fingerprints, headSha, nextRound } = input;

    if (nextRound > session.maxRounds) {
      const settled = await this.#ports.settleSession(session, "budget");
      this.#publish(settled.chatId);
      return;
    }

    // Claim fingerprints + bump round *before* send so a crash mid-send does
    // not re-fire the same batch forever.
    const claimed = await this.#ports.saveSession({
      ...session,
      state: "watching",
      holdReason: null,
      round: nextRound,
      headSha: headSha ?? session.headSha,
      handledFingerprints: uniqueStrings([
        ...session.handledFingerprints,
        ...fingerprints,
      ]),
      pendingPrompt: null,
      pendingFingerprints: [],
      lastSentHeadSha: headSha ?? session.headSha,
    });

    const runId = randomUUID();
    const runInput: ChatRunStartInput = {
      chatId: session.chatId,
      origin: "shepherd",
      text: prompt,
    };

    try {
      this.#chatRuns.start(runId, runInput);
      this.#activity.start(session.chatId, runId);
      this.#chatEvents.conversationChanged([session.chatId]);
      this.#awaitingProgress.set(session.chatId, {
        sessionId: session.id,
        origin: "shepherd",
      });
    } catch {
      // Roll back claim so the next tick can retry.
      await this.#ports.saveSession({
        ...claimed,
        round: session.round,
        handledFingerprints: session.handledFingerprints,
        lastSentHeadSha: session.lastSentHeadSha,
      });
      this.#publish(session.chatId);
      return;
    }

    this.#publish(claimed.chatId);
  }

  async #recordProgress(session: ShepherdSession): Promise<void> {
    const chat = await this.#ports.getChat(session.chatId);
    let currentHeadSha = session.headSha;
    if (chat !== null && is.nonEmptyString(chat.cwd)) {
      try {
        const snapshot = await this.#ports.fetchSnapshot({
          cwd: chat.cwd,
          owner: session.owner,
          prNumber: session.prNumber,
          repo: session.repo,
        });
        currentHeadSha = snapshot.checks.headOid;
      } catch {
        // Keep previous headSha if the check fails.
      }
    }

    const fresh = await this.#ports.getSessionById(session.id);
    if (fresh === null || fresh.state === "settled") return;

    const progress = progressAfterShepherdTurn({
      session: fresh,
      currentHeadSha,
    });

    if (progress.blocked) {
      const settled = await this.#ports.settleSession(fresh, "blocked");
      this.#publish(settled.chatId);
      return;
    }

    const next = await this.#ports.saveSession({
      ...fresh,
      consecutiveNoProgress: progress.consecutiveNoProgress,
      headSha: currentHeadSha ?? fresh.headSha,
    });
    this.#publish(next.chatId);
  }

  async #gateFor(chatId: string) {
    const activity = this.#activity.get(chatId);
    const queued = await this.#ports.listQueuedChatRuns();
    const hasQueuedChatRun = queued.some((run) => run.input.chatId === chatId);
    const ambiguous = await this.#ports.getAmbiguousQueuedChatRun(chatId);
    return evaluateShepherdGate({
      activity,
      hasQueuedChatRun,
      hasAmbiguousChatRun: ambiguous !== null,
    });
  }

  async #requireSession(id: string): Promise<ShepherdSession> {
    const session = await this.#ports.getSessionById(id);
    if (session === null) {
      throw DE.invalidRequest("Shepherd session not found.");
    }
    return session;
  }

  /**
   * Project the live send-gate hold onto a watching session. Not persisted —
   * every GET recomputes so the panel never re-derives idle/activity itself.
   */
  async #projectHoldReason(session: ShepherdSession): Promise<ShepherdSession> {
    if (session.state !== "watching") {
      return { ...session, holdReason: null };
    }
    const gate = await this.#gateFor(session.chatId);
    if (gate.action === "hold") {
      return { ...session, holdReason: gate.reason };
    }
    return { ...session, holdReason: null };
  }

  #publish(chatId: string): void {
    this.#chatEvents.shepherdChanged(chatId);
  }

  #publishHoldChange(chatId: string, reason: ShepherdHoldReason | null): void {
    const previous = this.#publishedHold.get(chatId) ?? null;
    if (previous === reason) return;
    this.#publishedHold.set(chatId, reason);
    this.#publish(chatId);
  }
}

function createDefaultPorts(deps: ShepherdServiceDeps): ShepherdPorts {
  const run = deps.run;
  const gh = { runGh: deps.runGh, whichGh: deps.whichGh };
  const defaults: ShepherdPorts = {
    listActiveSessions: () => run(listActiveShepherdSessions()),
    getSessionById: (id) => run(getShepherdSessionById(id)),
    getSessionByChatId: (chatId) => run(getShepherdSessionByChatId(chatId)),
    createSession: (input) => run(createShepherdSession(input)),
    saveSession: (session) => run(saveShepherdSession(session)),
    settleSession: (session, reason) =>
      run(settleShepherdSession(session, reason)),
    requireChat: (chatId) => run(requireChat(chatId)),
    getChat: (chatId) => run(getChat(chatId)),
    listQueuedChatRuns: () => run(listQueuedChatRuns()),
    getAmbiguousQueuedChatRun: (chatId) =>
      run(getAmbiguousQueuedChatRun(chatId)),
    fetchSnapshot: async (input) => {
      const checks = await run(
        fetchGitHubChecks(
          {
            cwd: input.cwd,
            owner: input.owner,
            prNumber: input.prNumber,
            repo: input.repo,
          },
          gh,
        ),
      );
      const threads = await run(
        fetchGitHubReviewThreads(
          {
            cwd: input.cwd,
            owner: input.owner,
            prNumber: input.prNumber,
            repo: input.repo,
          },
          gh,
        ),
      );
      let prState: string | null = null;
      try {
        const pr = await run(
          viewPullRequest({ cwd: input.cwd, number: input.prNumber }, gh),
        );
        prState = pr.state;
      } catch {
        prState = null;
      }
      return { checks, threads, prState, cwd: input.cwd };
    },
    fetchFailureLog: async (input) => {
      try {
        return await run(
          fetchGitHubFailureLog(
            { cwd: input.cwd, runId: input.runId, repo: input.repo },
            gh,
          ),
        );
      } catch {
        return { lines: [], truncated: false };
      }
    },
  };
  return { ...defaults, ...deps.ports };
}

function requireChatCwd(cwd: string | null | undefined): string {
  if (!is.nonEmptyString(cwd)) {
    throw DE.invalidRequest(
      "Chat working directory is required to shepherd a PR.",
    );
  }
  return cwd;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}
