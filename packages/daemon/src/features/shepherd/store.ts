import type {
  ShepherdSession,
  ShepherdSettledReason,
  ShepherdState,
} from "@angel-engine/daemon-api/shepherd";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { shepherdSessions } from "../../db/schema";
import { withDatabase } from "../../platform/db";
import { DaemonError } from "../../platform/errors";

export interface CreateShepherdSessionInput {
  chatId: string;
  owner: string;
  repo: string;
  prNumber: number;
  maxRounds: number;
  headSha: string | null;
  baselineSnapshot: unknown | null;
  handledFingerprints?: string[];
}

export function createShepherdSession(input: CreateShepherdSessionInput) {
  return withDatabase(async (database) => {
    const now = new Date().toISOString();
    const session: ShepherdSession = {
      id: randomUUID(),
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
      createdAt: now,
      updatedAt: now,
    };
    await database.insert(shepherdSessions).values(toRow(session)).run();
    return session;
  });
}

export function getShepherdSessionById(id: string) {
  return withDatabase(async (database) => {
    const row = await database
      .select()
      .from(shepherdSessions)
      .where(eq(shepherdSessions.id, id))
      .limit(1)
      .get();
    return row ? fromRow(row) : null;
  });
}

export function getShepherdSessionByChatId(chatId: string) {
  return withDatabase(async (database) => {
    const row = await database
      .select()
      .from(shepherdSessions)
      .where(eq(shepherdSessions.chatId, chatId))
      .limit(1)
      .get();
    return row ? fromRow(row) : null;
  });
}

export function listActiveShepherdSessions() {
  return withDatabase(async (database) => {
    const rows = await database.select().from(shepherdSessions).all();
    return rows
      .map(fromRow)
      .filter(
        (session) => session.state === "watching" || session.state === "queued",
      );
  });
}

export function listAllShepherdSessions() {
  return withDatabase(async (database) => {
    const rows = await database.select().from(shepherdSessions).all();
    return rows.map(fromRow);
  });
}

export function saveShepherdSession(session: ShepherdSession) {
  return withDatabase(async (database) => {
    const next = { ...session, updatedAt: new Date().toISOString() };
    await database
      .update(shepherdSessions)
      .set(toRow(next))
      .where(eq(shepherdSessions.id, session.id))
      .run();
    return next;
  });
}

export function settleShepherdSession(
  session: ShepherdSession,
  reason: ShepherdSettledReason,
) {
  return saveShepherdSession({
    ...session,
    state: "settled",
    settledReason: reason,
    pendingPrompt: null,
    pendingFingerprints: [],
  });
}

export function requireShepherdSession(id: string) {
  return Effect.gen(function* () {
    const session = yield* getShepherdSessionById(id);
    if (session === null) {
      return yield* Effect.fail(
        DaemonError.invalidRequest("Shepherd session not found."),
      );
    }
    return session;
  });
}

function toRow(session: ShepherdSession) {
  return {
    id: session.id,
    chatId: session.chatId,
    owner: session.owner,
    repo: session.repo,
    prNumber: session.prNumber,
    headSha: session.headSha,
    state: session.state satisfies ShepherdState as string,
    settledReason: session.settledReason,
    round: session.round,
    maxRounds: session.maxRounds,
    consecutiveNoProgress: session.consecutiveNoProgress,
    handledFingerprints: JSON.stringify(session.handledFingerprints),
    baselineSnapshot:
      session.baselineSnapshot === null
        ? null
        : JSON.stringify(session.baselineSnapshot),
    pendingPrompt: session.pendingPrompt,
    pendingFingerprints: JSON.stringify(session.pendingFingerprints),
    lastSentHeadSha: session.lastSentHeadSha,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function fromRow(row: typeof shepherdSessions.$inferSelect): ShepherdSession {
  return {
    id: row.id,
    chatId: row.chatId,
    owner: row.owner,
    repo: row.repo,
    prNumber: row.prNumber,
    headSha: row.headSha,
    state: row.state as ShepherdState,
    settledReason: (row.settledReason as ShepherdSettledReason | null) ?? null,
    round: row.round,
    maxRounds: row.maxRounds,
    consecutiveNoProgress: row.consecutiveNoProgress,
    handledFingerprints: parseStringArray(row.handledFingerprints),
    baselineSnapshot: parseJson(row.baselineSnapshot),
    pendingPrompt: row.pendingPrompt,
    pendingFingerprints: parseStringArray(row.pendingFingerprints),
    lastSentHeadSha: row.lastSentHeadSha,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function parseJson(raw: string | null): unknown | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
