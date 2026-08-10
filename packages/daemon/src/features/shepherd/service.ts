import type { ChatRunStartInput } from "@angel-engine/daemon-api/chat";
import type {
  GitHubChecksSnapshot,
  GitHubFailureLogResult,
  GitHubReviewThreadsResult,
} from "@angel-engine/daemon-api/github";
import type {
  ShepherdSession,
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
import { buildShepherdPrompt, collectNewComments } from "./prompt";
import {
  createShepherdSession,
  getShepherdSessionByChatId,
  getShepherdSessionById,
  listActiveShepherdSessions,
  requireShepherdSession,
  saveShepherdSession,
  settleShepherdSession,
} from "./store";

const ACTIVE_POLL_MS = 30_000;
const IDLE_POLL_MS = 120_000;

export interface ShepherdServiceDeps {
  activity: ChatActivityStore;
  chatRuns: ChatRunRegistry;
  chatEvents: ChatEventsApi;
  run: <A>(effect: Effect.Effect<A, DaemonError, Db>) => Promise<A>;
  runGh?: GhRunner;
  whichGh?: () => Promise<string | null>;
  setTimer?: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

/**
 * Owns shepherd lifecycle: start/stop/resume, polling, gate, and auto-sends.
 * Pure evaluation lives in `evaluate.ts` / `gate.ts` for unit tests.
 */
export class ShepherdService {
  readonly #activity: ChatActivityStore;
  readonly #chatRuns: ChatRunRegistry;
  readonly #chatEvents: ChatEventsApi;
  readonly #run: ShepherdServiceDeps["run"];
  readonly #runGh?: GhRunner;
  readonly #whichGh?: () => Promise<string | null>;
  readonly #setTimer: NonNullable<ShepherdServiceDeps["setTimer"]>;
  readonly #clearTimer: NonNullable<ShepherdServiceDeps["clearTimer"]>;

  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #inFlight = new Set<string>();
  /** chatIds whose last shepherd send we are waiting to finish for progress. */
  readonly #awaitingProgress = new Map<
    string,
    { sessionId: string; origin: "shepherd" }
  >();
  #activityDetached = false;
  #started = false;

  constructor(deps: ShepherdServiceDeps) {
    this.#activity = deps.activity;
    this.#chatRuns = deps.chatRuns;
    this.#chatEvents = deps.chatEvents;
    this.#run = deps.run;
    this.#runGh = deps.runGh;
    this.#whichGh = deps.whichGh;
    this.#setTimer = deps.setTimer ?? setTimeout;
    this.#clearTimer = deps.clearTimer ?? clearTimeout;
  }

  /** Restore watching/queued sessions after daemon boot. */
  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    const active = await this.#run(listActiveShepherdSessions());
    for (const session of active) {
      // Re-evaluate from a fresh snapshot — never act on a stale baseline alone.
      this.#schedule(session.id, 0);
    }
  }

  stopAll(): void {
    for (const timer of this.#timers.values()) this.#clearTimer(timer);
    this.#timers.clear();
    this.#started = false;
  }

  async getByChatId(chatId: string): Promise<ShepherdSession | null> {
    return this.#run(getShepherdSessionByChatId(chatId));
  }

  async startSession(input: ShepherdStartInput): Promise<ShepherdSession> {
    const chat = await this.#run(requireChat(input.chatId));
    const cwd = requireChatCwd(chat.cwd);
    const existing = await this.#run(getShepherdSessionByChatId(input.chatId));
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

    const snapshot = await this.#fetchSnapshot({
      cwd,
      owner: input.owner,
      prNumber: input.prNumber,
      repo: input.repo,
    });

    // Fingerprints start empty so an already-red PR still triggers a first turn.
    // The baseline snapshot only records headSha / UI context for restore.
    let session: ShepherdSession;
    if (existing) {
      session = await this.#run(
        saveShepherdSession({
          ...existing,
          owner: input.owner,
          repo: input.repo,
          prNumber: input.prNumber,
          headSha: snapshot.checks.headOid,
          state: "watching",
          settledReason: null,
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
        }),
      );
    } else {
      session = await this.#run(
        createShepherdSession({
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
        }),
      );
    }

    this.#publish(session.chatId);
    // Immediate first evaluation, then regular polling continues from #tick.
    this.#schedule(session.id, 0);
    return session;
  }

  async stopSession(id: string): Promise<ShepherdSession> {
    const session = await this.#run(requireShepherdSession(id));
    if (session.state === "settled" && session.settledReason === "stopped") {
      return session;
    }
    this.#clear(session.id);
    const next = await this.#run(settleShepherdSession(session, "stopped"));
    this.#awaitingProgress.delete(session.chatId);
    this.#publish(next.chatId);
    return next;
  }

  async resumeSession(id: string): Promise<ShepherdSession> {
    const session = await this.#run(requireShepherdSession(id));
    if (session.state !== "settled" || session.settledReason !== "stopped") {
      throw DE.invalidRequest(
        "Only a user-stopped shepherd session can be resumed.",
      );
    }
    const next = await this.#run(
      saveShepherdSession({
        ...session,
        state: "watching",
        settledReason: null,
        pendingPrompt: null,
        pendingFingerprints: [],
      }),
    );
    this.#publish(next.chatId);
    this.#schedule(next.id, 0);
    return next;
  }

  /**
   * User send yield: non-shepherd origin + active session → settled/stopped.
   * Returns true when yield happened.
   */
  async maybeYieldToUser(input: {
    chatId: string | undefined;
    origin: string | undefined;
  }): Promise<boolean> {
    if (!is.nonEmptyString(input.chatId)) return false;
    if (!isShepherdYieldOrigin(input.origin)) return false;
    const session = await this.#run(getShepherdSessionByChatId(input.chatId));
    if (
      session === null ||
      (session.state !== "watching" && session.state !== "queued")
    ) {
      return false;
    }
    this.#clear(session.id);
    await this.#run(settleShepherdSession(session, "stopped"));
    this.#awaitingProgress.delete(session.chatId);
    this.#publish(session.chatId);
    return true;
  }

  /**
   * Called when chat activity changes — flush queued shepherd sends and track
   * no-progress after a shepherd turn completes.
   */
  async onActivityChanged(chatId: string): Promise<void> {
    if (this.#activityDetached) return;
    const session = await this.#run(getShepherdSessionByChatId(chatId));
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

  /** Attach activity listener once — call from registerApi after construction. */
  attachActivityListener(previousOnChange?: (chatId: string) => void): void {
    // ChatActivityStore is constructed with onChange already; registerApi wires
    // both chatEvents and shepherd via a shared onChange. This method is a no-op
    // placeholder when wiring is done externally.
    void previousOnChange;
  }

  #schedule(sessionId: string, delayMs: number): void {
    this.#clear(sessionId);
    const timer = this.#setTimer(() => {
      this.#timers.delete(sessionId);
      void this.#tick(sessionId).catch(() => {
        // Retry later on unexpected errors.
        this.#schedule(sessionId, ACTIVE_POLL_MS);
      });
    }, delayMs);
    this.#timers.set(sessionId, timer);
  }

  #clear(sessionId: string): void {
    const timer = this.#timers.get(sessionId);
    if (timer !== undefined) {
      this.#clearTimer(timer);
      this.#timers.delete(sessionId);
    }
  }

  async #tick(sessionId: string): Promise<void> {
    if (this.#inFlight.has(sessionId)) {
      this.#schedule(sessionId, ACTIVE_POLL_MS);
      return;
    }
    this.#inFlight.add(sessionId);
    try {
      const session = await this.#run(getShepherdSessionById(sessionId));
      if (
        session === null ||
        (session.state !== "watching" && session.state !== "queued")
      ) {
        return;
      }

      const chat = await this.#run(getChat(session.chatId));
      if (chat === null || !is.nonEmptyString(chat.cwd)) {
        const settled = await this.#run(
          settleShepherdSession(session, "blocked"),
        );
        this.#publish(settled.chatId);
        return;
      }

      const snapshot = await this.#fetchSnapshot({
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
          this.#schedule(sessionId, ACTIVE_POLL_MS);
          return;
        case "head_changed": {
          const next = await this.#run(
            saveShepherdSession({
              ...session,
              headSha: decision.headSha,
              consecutiveNoProgress: 0,
              handledFingerprints: [],
              pendingFingerprints: [],
              pendingPrompt: null,
              baselineSnapshot: {
                checks: snapshot.checks,
                unresolvedCount: snapshot.threads.unresolvedCount,
              },
              state: session.state === "queued" ? "watching" : session.state,
            }),
          );
          this.#publish(next.chatId);
          this.#schedule(sessionId, 0);
          return;
        }
        case "settle": {
          this.#clear(sessionId);
          const next = await this.#run(
            settleShepherdSession(session, decision.reason),
          );
          this.#publish(next.chatId);
          return;
        }
        case "noop":
          this.#schedule(sessionId, IDLE_POLL_MS);
          return;
        case "dispatch": {
          await this.#handleDispatch(session, snapshot, decision);
          return;
        }
      }
    } finally {
      this.#inFlight.delete(sessionId);
    }
  }

  async #handleDispatch(
    session: ShepherdSession,
    snapshot: {
      checks: GitHubChecksSnapshot;
      threads: GitHubReviewThreadsResult;
      cwd: string;
    },
    decision: Extract<
      ReturnType<typeof evaluateShepherdTick>,
      { kind: "dispatch" }
    >,
  ): Promise<void> {
    // Build / merge prompt
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
      const log = await this.#fetchFailureLog(
        snapshot.cwd,
        check.workflowRunId,
        `${session.owner}/${session.repo}`,
      );
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
      this.#schedule(session.id, ACTIVE_POLL_MS);
      return;
    }

    if (gate.action === "queue") {
      const next = await this.#run(
        saveShepherdSession({
          ...session,
          state: "queued",
          pendingPrompt: mergedPrompt,
          pendingFingerprints: mergedFingerprints,
          headSha: snapshot.checks.headOid ?? session.headSha,
        }),
      );
      this.#publish(next.chatId);
      this.#schedule(session.id, ACTIVE_POLL_MS);
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
    const session = await this.#run(getShepherdSessionById(sessionId));
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
      this.#clear(session.id);
      const settled = await this.#run(settleShepherdSession(session, "budget"));
      this.#publish(settled.chatId);
      return;
    }

    // Claim fingerprints + bump round *before* send so a crash mid-send does
    // not re-fire the same batch forever.
    const claimed = await this.#run(
      saveShepherdSession({
        ...session,
        state: "watching",
        round: nextRound,
        headSha: headSha ?? session.headSha,
        handledFingerprints: uniqueStrings([
          ...session.handledFingerprints,
          ...fingerprints,
        ]),
        pendingPrompt: null,
        pendingFingerprints: [],
        lastSentHeadSha: headSha ?? session.headSha,
      }),
    );

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
      await this.#run(
        saveShepherdSession({
          ...claimed,
          round: session.round,
          handledFingerprints: session.handledFingerprints,
          lastSentHeadSha: session.lastSentHeadSha,
        }),
      );
      this.#schedule(session.id, ACTIVE_POLL_MS);
      this.#publish(session.chatId);
      return;
    }

    this.#publish(claimed.chatId);
    this.#schedule(session.id, ACTIVE_POLL_MS);
  }

  async #recordProgress(session: ShepherdSession): Promise<void> {
    const chat = await this.#run(getChat(session.chatId));
    let currentHeadSha = session.headSha;
    if (chat !== null && is.nonEmptyString(chat.cwd)) {
      try {
        const checks = await this.#run(
          fetchGitHubChecks(
            {
              cwd: chat.cwd,
              owner: session.owner,
              prNumber: session.prNumber,
              repo: session.repo,
            },
            { runGh: this.#runGh, whichGh: this.#whichGh },
          ),
        );
        currentHeadSha = checks.headOid;
      } catch {
        // Keep previous headSha if the check fails.
      }
    }

    const fresh = await this.#run(getShepherdSessionById(session.id));
    if (fresh === null || fresh.state === "settled") return;

    const progress = progressAfterShepherdTurn({
      session: fresh,
      currentHeadSha,
    });

    if (progress.blocked) {
      this.#clear(fresh.id);
      const settled = await this.#run(settleShepherdSession(fresh, "blocked"));
      this.#publish(settled.chatId);
      return;
    }

    const next = await this.#run(
      saveShepherdSession({
        ...fresh,
        consecutiveNoProgress: progress.consecutiveNoProgress,
        headSha: currentHeadSha ?? fresh.headSha,
      }),
    );
    this.#publish(next.chatId);
  }

  async #gateFor(chatId: string) {
    const activity = this.#activity.get(chatId);
    const queued = await this.#run(listQueuedChatRuns());
    const hasQueuedChatRun = queued.some((run) => run.input.chatId === chatId);
    const ambiguous = await this.#run(getAmbiguousQueuedChatRun(chatId));
    return evaluateShepherdGate({
      activity,
      hasQueuedChatRun,
      hasAmbiguousChatRun: ambiguous !== null,
    });
  }

  async #fetchSnapshot(input: {
    cwd: string;
    owner: string;
    prNumber: number;
    repo: string;
  }): Promise<{
    checks: GitHubChecksSnapshot;
    threads: GitHubReviewThreadsResult;
    prState: string | null;
    cwd: string;
  }> {
    const deps = { runGh: this.#runGh, whichGh: this.#whichGh };
    const checks = await this.#run(
      fetchGitHubChecks(
        {
          cwd: input.cwd,
          owner: input.owner,
          prNumber: input.prNumber,
          repo: input.repo,
        },
        deps,
      ),
    );
    const threads = await this.#run(
      fetchGitHubReviewThreads(
        {
          cwd: input.cwd,
          owner: input.owner,
          prNumber: input.prNumber,
          repo: input.repo,
        },
        deps,
      ),
    );
    let prState: string | null = null;
    try {
      const pr = await this.#run(
        viewPullRequest({ cwd: input.cwd, number: input.prNumber }, deps),
      );
      prState = pr.state;
    } catch {
      prState = null;
    }
    return { checks, threads, prState, cwd: input.cwd };
  }

  async #fetchFailureLog(cwd: string, runId: string, repo: string) {
    try {
      return await this.#run(
        fetchGitHubFailureLog(
          { cwd, runId, repo },
          { runGh: this.#runGh, whichGh: this.#whichGh },
        ),
      );
    } catch {
      return { lines: [] as string[], truncated: false };
    }
  }

  #publish(chatId: string): void {
    this.#chatEvents.shepherdChanged(chatId);
  }
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
