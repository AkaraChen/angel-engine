import type {
  AgentRuntime,
  CustomAgent,
} from "@angel-engine/daemon-api/agents";
import type {
  Chat,
  ChatCreateInput,
  ChatRunStartInput,
  WorktreeCreationState,
} from "@angel-engine/daemon-api/chat";
import { isChatRunStartInput } from "@angel-engine/daemon-api/chat";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import is from "@sindresorhus/is";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import {
  isAgentRuntime,
  isCustomAgentRuntime,
} from "@angel-engine/daemon-api/agents";
import { chats, queuedChatRuns, worktreeCreationJobs } from "../../db/schema";
import { type Db, withDatabase } from "../../platform/db";
import { DaemonError } from "../../platform/errors";
import { getCustomAgent } from "../agents/repository";
import { withManagedWorktreeLock } from "../projects/managed-worktree-lock";

const DEFAULT_CHAT_TITLE = "New chat";

type CreateChatRecordInput = ChatCreateInput & {
  cwd: string;
  remoteThreadId?: string | null;
};

export function listChats() {
  return withDatabase((database) =>
    database
      .select()
      .from(chats)
      .where(eq(chats.archived, false))
      .orderBy(desc(chats.updatedAt))
      .all(),
  );
}

export function listArchivedChats() {
  return withDatabase((database) =>
    database
      .select()
      .from(chats)
      .where(eq(chats.archived, true))
      .orderBy(desc(chats.updatedAt))
      .all(),
  );
}

export function findActiveChatByCwd(cwd: string) {
  return withDatabase((database) =>
    database
      .select()
      .from(chats)
      .where(and(eq(chats.archived, false), eq(chats.cwd, cwd)))
      .limit(1)
      .get(),
  );
}

export function getChat(
  id: string,
): Effect.Effect<Chat | null, DaemonError, Db> {
  return Effect.gen(function* () {
    const chatId = yield* requireChatId(id);
    const chat = yield* withDatabase((database) =>
      database.select().from(chats).where(eq(chats.id, chatId)).limit(1).get(),
    );
    return chat ?? null;
  });
}

/**
 * Takes the managed-worktree lock: a chat claiming a worktree cwd must not
 * land between a worktree deletion's eligibility check and its `rm`.
 */
export function createChat(
  input: CreateChatRecordInput,
): Effect.Effect<Chat, DaemonError, Db> {
  return withManagedWorktreeLock(
    Effect.gen(function* () {
      const now = new Date().toISOString();
      const cwd = yield* normalizeOptionalDirectory(input.cwd);
      const runtime = yield* normalizeChatRuntime(input.runtime);
      return yield* withDatabase((database) =>
        database
          .insert(chats)
          .values({
            createdAt: now,
            cwd,
            id: randomUUID(),
            projectId: normalizeOptionalString(input.projectId),
            remoteThreadId: normalizeOptionalString(input.remoteThreadId),
            sourceLink: input.sourceLink,
            runtime,
            title: normalizeTitle(input.title),
            updatedAt: now,
            archived: false,
            pinned: false,
          })
          .returning()
          .get(),
      );
    }),
  );
}

export function deleteChat(id: string): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* requireChat(id);
    yield* withDatabase((database) =>
      database.delete(chats).where(eq(chats.id, chat.id)).run(),
    );
    return chat;
  });
}

export function deleteAllChats(): Effect.Effect<number, DaemonError, Db> {
  return Effect.gen(function* () {
    const existingChats = yield* withDatabase((database) =>
      database.select().from(chats).all(),
    );
    yield* withDatabase((database) => database.delete(chats).run());
    return existingChats.length;
  });
}

export interface PersistedQueuedChatRun {
  createdAt: string;
  input: ChatRunStartInput;
  runId: string;
  state: QueuedChatRunState;
}

export type QueuedChatRunState = "dispatching" | "queued";
export type QueuedChatRunDispatchClaim =
  | "claimed"
  | "dispatching"
  | "not_queued";

export function createQueuedChatRun(run: PersistedQueuedChatRun) {
  return withDatabase((database) =>
    database
      .insert(queuedChatRuns)
      .values({
        chatId: run.input.chatId,
        createdAt: run.createdAt,
        input: JSON.stringify(run.input),
        runId: run.runId,
        state: run.state,
      })
      .run(),
  );
}

export function beginQueuedChatRunDispatch(runId: string) {
  return withDatabase(async (database) => {
    const result = await database
      .update(queuedChatRuns)
      .set({ state: "dispatching" })
      .where(
        and(
          eq(queuedChatRuns.runId, runId),
          eq(queuedChatRuns.state, "queued"),
        ),
      )
      .run();
    if (result.rowsAffected === 1) return "claimed" as const;
    const row = await database
      .select({ state: queuedChatRuns.state })
      .from(queuedChatRuns)
      .where(eq(queuedChatRuns.runId, runId))
      .limit(1)
      .get();
    return row?.state === "dispatching"
      ? ("dispatching" as const)
      : ("not_queued" as const);
  });
}

export function completeQueuedChatRun(runId: string) {
  return withDatabase((database) =>
    database
      .delete(queuedChatRuns)
      .where(
        and(
          eq(queuedChatRuns.runId, runId),
          eq(queuedChatRuns.state, "dispatching"),
        ),
      )
      .run(),
  );
}

export function cancelQueuedChatRun(runId: string) {
  return withDatabase((database) =>
    database
      .delete(queuedChatRuns)
      .where(eq(queuedChatRuns.runId, runId))
      .returning({ chatId: queuedChatRuns.chatId })
      .get()
      .then((row) => row ?? null),
  );
}

export function cancelAmbiguousQueuedChatRun(chatId: string) {
  return withDatabase((database) =>
    database
      .delete(queuedChatRuns)
      .where(
        and(
          eq(queuedChatRuns.chatId, chatId),
          eq(queuedChatRuns.state, "dispatching"),
        ),
      )
      .returning({ runId: queuedChatRuns.runId })
      .get()
      .then((row) => row ?? null),
  );
}

export function listQueuedChatRuns() {
  return Effect.gen(function* () {
    const rows = yield* withDatabase((database) =>
      database
        .select()
        .from(queuedChatRuns)
        .orderBy(queuedChatRuns.createdAt)
        .all(),
    );
    const invalidRunIds: string[] = [];
    const valid: PersistedQueuedChatRun[] = [];
    for (const row of rows) {
      try {
        const input: unknown = JSON.parse(row.input);
        if (
          !isChatRunStartInput(input) ||
          (row.state !== "queued" && row.state !== "dispatching")
        ) {
          invalidRunIds.push(row.runId);
          continue;
        }
        valid.push({
          createdAt: row.createdAt,
          input,
          runId: row.runId,
          state: row.state,
        });
      } catch {
        invalidRunIds.push(row.runId);
      }
    }
    if (invalidRunIds.length > 0) {
      yield* withDatabase((database) =>
        database
          .delete(queuedChatRuns)
          .where(inArray(queuedChatRuns.runId, invalidRunIds))
          .run(),
      );
    }
    return valid;
  });
}

/**
 * Only never-dispatched rows are safe for automatic recovery. A dispatching
 * row is durable evidence of an ambiguous provider boundary and must remain
 * stored until an explicit cancel/retry decision, never auto-send again.
 */
export function listRecoverableQueuedChatRuns() {
  return listQueuedChatRuns().pipe(
    Effect.map((runs) => runs.filter((run) => run.state === "queued")),
  );
}

export function getAmbiguousQueuedChatRun(chatId: string) {
  return listQueuedChatRuns().pipe(
    Effect.map(
      (runs) =>
        runs.find(
          (run) => run.input.chatId === chatId && run.state === "dispatching",
        ) ?? null,
    ),
  );
}

export interface PersistedWorktreeCreationJob {
  chatId: string;
  setupApproval?: string;
  worktreeRef?: ChatCreateInput["worktreeRef"];
  state: WorktreeCreationState;
}

export function createWorktreeCreationJob(job: PersistedWorktreeCreationJob) {
  return withDatabase((database) =>
    database.insert(worktreeCreationJobs).values(jobValues(job)).run(),
  );
}

export function getWorktreeCreationJob(chatId: string) {
  return withDatabase((database) =>
    database
      .select()
      .from(worktreeCreationJobs)
      .where(eq(worktreeCreationJobs.chatId, chatId))
      .limit(1)
      .get()
      .then((row) => (row ? persistedWorktreeCreationJob(row) : null)),
  );
}

export function listWorktreeCreationJobs() {
  return withDatabase((database) =>
    database
      .select()
      .from(worktreeCreationJobs)
      .all()
      .then((rows) => rows.map(persistedWorktreeCreationJob)),
  );
}

export function updateWorktreeCreationJob(job: PersistedWorktreeCreationJob) {
  return withDatabase((database) =>
    database
      .update(worktreeCreationJobs)
      .set(jobValues(job))
      .where(eq(worktreeCreationJobs.chatId, job.chatId))
      .run(),
  );
}

export function deleteWorktreeCreationJob(chatId: string) {
  return withDatabase((database) =>
    database
      .delete(worktreeCreationJobs)
      .where(eq(worktreeCreationJobs.chatId, chatId))
      .run(),
  );
}

export function failInterruptedWorktreeCreationJobs() {
  return withDatabase((database) =>
    database
      .update(worktreeCreationJobs)
      .set({
        error: "Worktree creation was interrupted. Retry or cancel it.",
        status: "failed",
      })
      .where(eq(worktreeCreationJobs.status, "creating"))
      .run(),
  );
}

function jobValues(job: PersistedWorktreeCreationJob) {
  return {
    chatId: job.chatId,
    error: job.state.error ?? null,
    jobId: job.state.jobId,
    progress: job.state.progress,
    setupApproval: job.setupApproval ?? null,
    worktreeRef: job.worktreeRef ?? null,
    stage: job.state.stage,
    status: job.state.status,
  };
}

function persistedWorktreeCreationJob(
  row: typeof worktreeCreationJobs.$inferSelect,
): PersistedWorktreeCreationJob {
  return {
    chatId: row.chatId,
    setupApproval: row.setupApproval ?? undefined,
    worktreeRef: row.worktreeRef ?? undefined,
    state: {
      error: row.error ?? undefined,
      jobId: row.jobId,
      progress: row.progress,
      stage: row.stage as WorktreeCreationState["stage"],
      status: row.status as WorktreeCreationState["status"],
    },
  };
}

export function archiveChat(id: string) {
  return updateChat(id, { archived: true });
}

/**
 * Takes the managed-worktree lock: restoring an archived chat makes its
 * worktree ineligible, so it must not interleave with a worktree deletion.
 */
export function restoreArchivedChats(
  ids: string[],
): Effect.Effect<Chat[], DaemonError, Db> {
  return withManagedWorktreeLock(
    Effect.gen(function* () {
      const restoredChats: Chat[] = [];
      for (const id of yield* uniqueChatIds(ids)) {
        yield* requireArchivedChat(id);
        restoredChats.push(yield* updateChat(id, { archived: false }));
      }
      return restoredChats;
    }),
  );
}

export function deleteArchivedChats(
  ids: string[],
): Effect.Effect<Chat[], DaemonError, Db> {
  return Effect.gen(function* () {
    const chatIds = yield* uniqueChatIds(ids);
    const archivedChats = yield* Effect.all(
      chatIds.map((id) => requireArchivedChat(id)),
    );
    for (const chat of archivedChats) {
      yield* withDatabase((database) =>
        database.delete(chats).where(eq(chats.id, chat.id)).run(),
      );
    }
    return archivedChats;
  });
}

export function setChatPinned(id: string, pinned: boolean) {
  return updateChat(id, { pinned });
}

export function touchChat(id: string) {
  return updateChat(id, { updatedAt: new Date().toISOString() });
}

export function setChatCwd(id: string, cwd: string) {
  return updateChat(id, {
    cwd,
    updatedAt: new Date().toISOString(),
  });
}

export function setChatRemoteThreadId(
  id: string,
  remoteThreadId: string | null,
) {
  return updateChat(id, {
    remoteThreadId: normalizeOptionalString(remoteThreadId),
    updatedAt: new Date().toISOString(),
  });
}

export function setChatRuntime(
  id: string,
  runtime: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* requireChat(id);
    if (is.nonEmptyString(chat.remoteThreadId)) {
      return yield* Effect.fail(DaemonError.chatRuntimeLocked());
    }

    return yield* updateChat(id, {
      runtime: yield* normalizeChatRuntime(runtime),
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Persists everything a send already knows before its turn runs: the prompt
 * title for a chat still carrying the default one, and the `updatedAt` that
 * orders every client's chat list.
 *
 * This is deliberately not deferred to the turn's result. A first turn can run
 * for minutes, and until it settles the row would keep the default title and a
 * stale sort position on every surface — the desktop sidebar and the phone
 * both read the list, not the run stream.
 */
export function beginChatSend(
  id: string,
  prompt: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chatId = yield* requireChatId(id);

    // The rename is a conditional write rather than a read-then-write: a manual
    // `PATCH /api/chats/:id` racing this send must win, and a read of the old
    // title would otherwise overwrite the name the user just chose.
    if (is.nonEmptyString(prompt)) {
      yield* withDatabase((database) =>
        database
          .update(chats)
          .set({ title: titleFromPrompt(prompt) })
          .where(and(eq(chats.id, chatId), eq(chats.title, DEFAULT_CHAT_TITLE)))
          .run(),
      );
    }

    return yield* touchChat(chatId);
  });
}

export function renameChat(
  id: string,
  title: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    return yield* updateChat(id, {
      title: yield* normalizeManualTitle(title),
      updatedAt: new Date().toISOString(),
    });
  });
}

export function requireChat(id: string): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* getChat(id);
    if (is.falsy(chat)) {
      return yield* Effect.fail(DaemonError.chatNotFound());
    }
    return chat;
  });
}

export function requireArchivedChat(
  id: string,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chat = yield* requireChat(id);
    if (!chat.archived) {
      return yield* Effect.fail(DaemonError.chatNotArchived());
    }
    return chat;
  });
}

function updateChat(
  id: string,
  patch: Partial<
    Pick<
      Chat,
      | "archived"
      | "cwd"
      | "pinned"
      | "remoteThreadId"
      | "runtime"
      | "title"
      | "updatedAt"
    >
  >,
): Effect.Effect<Chat, DaemonError, Db> {
  return Effect.gen(function* () {
    const chatId = yield* requireChatId(id);
    const chat = yield* withDatabase((database) =>
      database
        .update(chats)
        .set(patch)
        .where(eq(chats.id, chatId))
        .returning()
        .get(),
    );

    if (is.falsy(chat)) {
      return yield* Effect.fail(DaemonError.chatNotFound());
    }

    return chat;
  });
}

function requireChatId(id: string): Effect.Effect<string, DaemonError> {
  if (!is.nonEmptyString(id)) {
    return Effect.fail(DaemonError.chatIdRequired());
  }
  return Effect.succeed(id);
}

function uniqueChatIds(ids: string[]): Effect.Effect<string[], DaemonError> {
  return Effect.gen(function* () {
    const uniqueIds = [
      ...new Set(yield* Effect.all(ids.map((id) => requireChatId(id)))),
    ];
    if (uniqueIds.length === 0) {
      return yield* Effect.fail(DaemonError.chatIdsRequired());
    }
    return uniqueIds;
  });
}

type CustomAgentLookup = (
  runtime: string,
) => Effect.Effect<CustomAgent | null, DaemonError, Db>;

export function normalizeChatRuntime(
  runtime: string | undefined,
  customAgentLookup: CustomAgentLookup = getCustomAgent,
): Effect.Effect<AgentRuntime, DaemonError, Db> {
  return Effect.gen(function* () {
    const candidate = is.nonEmptyString(runtime)
      ? runtime
      : process.env.ANGEL_ENGINE_RUNTIME;

    if (!is.nonEmptyString(candidate)) {
      return yield* Effect.fail(
        DaemonError.chatRuntimeUnknown("Chat runtime is required."),
      );
    }

    if (!isAgentRuntime(candidate)) {
      return yield* Effect.fail(DaemonError.chatRuntimeUnknown());
    }

    if (isCustomAgentRuntime(candidate)) {
      const customAgent = yield* customAgentLookup(candidate);
      if (customAgent === null) {
        return yield* Effect.fail(DaemonError.chatRuntimeUnknown());
      }
    }

    return candidate;
  });
}

function normalizeTitle(title: string | undefined) {
  return is.nonEmptyString(title) ? title : DEFAULT_CHAT_TITLE;
}

function normalizeManualTitle(
  title: string,
): Effect.Effect<string, DaemonError> {
  const normalizedTitle = title.replace(/\s+/g, " ").trim();
  if (!is.nonEmptyString(normalizedTitle)) {
    return Effect.fail(DaemonError.chatTitleRequired());
  }
  return Effect.succeed(normalizedTitle);
}

function normalizeOptionalString(value: string | null | undefined) {
  if (!is.nonEmptyString(value)) return null;
  return value;
}

function normalizeOptionalDirectory(
  value: string | null | undefined,
): Effect.Effect<string | null, DaemonError> {
  return Effect.gen(function* () {
    const dirPath = normalizeOptionalString(value);
    if (!is.nonEmptyString(dirPath)) return null;

    const resolvedPath = path.resolve(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      return yield* Effect.fail(
        DaemonError.chatCwdInvalid("Chat cwd does not exist."),
      );
    }

    if (!fs.statSync(resolvedPath).isDirectory()) {
      return yield* Effect.fail(
        DaemonError.chatCwdInvalid("Chat cwd must be a directory."),
      );
    }

    return resolvedPath;
  });
}

function titleFromPrompt(prompt: string) {
  const title = prompt.replace(/\s+/g, " ").trim();
  if (!title) return DEFAULT_CHAT_TITLE;
  return title.length > 48 ? `${title.slice(0, 47)}...` : title;
}
