import type {
  Automation,
  AutomationRun,
  AutomationRunStatus,
  AutomationStatus,
  AutomationTrigger,
  CreateAutomationInput,
  UpdateAutomationInput,
} from "@angel-engine/daemon-api/automations";
import type { AutomationRow, AutomationRunRow } from "../../db/schema";

import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { Effect } from "effect";
import { automationRuns, automations } from "../../db/schema";
import { type Db, withDatabase } from "../../platform/db";
import { DaemonError } from "../../platform/errors";

const DEFAULT_HISTORY_LIMIT = 100;

export function listAutomations(): Effect.Effect<
  Automation[],
  DaemonError,
  Db
> {
  return Effect.gen(function* () {
    const records = yield* withDatabase((database) =>
      database.select().from(automations).orderBy(asc(automations.name)).all(),
    );
    return yield* Effect.all(records.map(hydrateAutomation));
  });
}

export function getAutomation(id: string) {
  return Effect.gen(function* () {
    const record = yield* getAutomationRecord(id);
    return record ? yield* hydrateAutomation(record) : null;
  });
}

export function requireAutomationRecord(id: string) {
  return Effect.gen(function* () {
    const record = yield* getAutomationRecord(id);
    if (!record) return yield* Effect.fail(DaemonError.automationNotFound());
    return record;
  });
}

export function createAutomationRecord(
  input: CreateAutomationInput,
  nextRunAt: string | null,
) {
  return Effect.gen(function* () {
    const now = new Date().toISOString();
    const record = yield* withDatabase((database) =>
      database
        .insert(automations)
        .values({
          createdAt: now,
          cron: input.cron.trim(),
          enabled: input.enabled ?? true,
          id: randomUUID(),
          name: input.name.trim(),
          nextRunAt,
          notifyOnFailure: input.notifyOnFailure ?? true,
          projectId: input.projectId ?? null,
          prompt: input.prompt.trim(),
          runtime: input.runtime,
          updatedAt: now,
          workspaceKind: input.workspaceKind ?? "project",
        })
        .returning()
        .get(),
    );
    return yield* hydrateAutomation(record);
  });
}

export function updateAutomationRecord(
  id: string,
  input: UpdateAutomationInput,
  nextRunAt: string | null | undefined,
) {
  return Effect.gen(function* () {
    yield* requireAutomationRecord(id);
    const values = {
      ...(input.cron === undefined ? {} : { cron: input.cron.trim() }),
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(nextRunAt === undefined ? {} : { nextRunAt }),
      ...(input.notifyOnFailure === undefined
        ? {}
        : { notifyOnFailure: input.notifyOnFailure }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.prompt === undefined ? {} : { prompt: input.prompt.trim() }),
      ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
      ...(input.workspaceKind === undefined
        ? {}
        : { workspaceKind: input.workspaceKind }),
      updatedAt: new Date().toISOString(),
    };
    const record = yield* withDatabase((database) =>
      database
        .update(automations)
        .set(values)
        .where(eq(automations.id, id))
        .returning()
        .get(),
    );
    return yield* hydrateAutomation(record);
  });
}

export function deleteAutomationRecord(id: string) {
  return Effect.gen(function* () {
    const record = yield* requireAutomationRecord(id);
    yield* withDatabase((database) =>
      database.delete(automations).where(eq(automations.id, id)).run(),
    );
    return record;
  });
}

export function listDueAutomationRecords(now: string) {
  return withDatabase((database) =>
    database
      .select()
      .from(automations)
      .where(
        and(eq(automations.enabled, true), lte(automations.nextRunAt, now)),
      )
      .orderBy(asc(automations.nextRunAt))
      .all(),
  );
}

export function setAutomationNextRun(id: string, nextRunAt: string | null) {
  return withDatabase((database) =>
    database
      .update(automations)
      .set({ nextRunAt, updatedAt: new Date().toISOString() })
      .where(eq(automations.id, id))
      .run(),
  );
}

export function hasActiveAutomationRun(automationId: string) {
  return withDatabase((database) =>
    database
      .select({ id: automationRuns.id })
      .from(automationRuns)
      .where(
        and(
          eq(automationRuns.automationId, automationId),
          eq(automationRuns.status, "running"),
        ),
      )
      .limit(1)
      .get()
      .then(Boolean),
  );
}

export function createAutomationRun(input: {
  automationId: string;
  scheduledFor?: string | null;
  startedAt?: string;
  status?: AutomationRunStatus;
  trigger: AutomationTrigger;
}) {
  const startedAt = input.startedAt ?? new Date().toISOString();
  const terminal = input.status === "missed" || input.status === "cancelled";
  return withDatabase((database) =>
    database
      .insert(automationRuns)
      .values({
        automationId: input.automationId,
        error: null,
        finishedAt: terminal ? new Date().toISOString() : null,
        id: randomUUID(),
        scheduledFor: input.scheduledFor ?? null,
        startedAt,
        status: input.status ?? "running",
        trigger: input.trigger,
      })
      .returning()
      .get(),
  );
}

export function attachAutomationRunChat(id: string, chatId: string) {
  return withDatabase((database) =>
    database
      .update(automationRuns)
      .set({ chatId })
      .where(eq(automationRuns.id, id))
      .run(),
  );
}

export function finishAutomationRun(
  id: string,
  status: Extract<AutomationRunStatus, "cancelled" | "failed" | "succeeded">,
  error?: string,
) {
  return withDatabase((database) =>
    database
      .update(automationRuns)
      .set({
        error: error ?? null,
        finishedAt: new Date().toISOString(),
        status,
      })
      .where(
        and(eq(automationRuns.id, id), eq(automationRuns.status, "running")),
      )
      .returning({ automationId: automationRuns.automationId })
      .get()
      .then((row) => row?.automationId ?? null),
  );
}

export function listAutomationRuns(
  automationId: string,
  limit = DEFAULT_HISTORY_LIMIT,
) {
  return Effect.gen(function* () {
    yield* requireAutomationRecord(automationId);
    const rows = yield* withDatabase((database) =>
      database
        .select()
        .from(automationRuns)
        .where(eq(automationRuns.automationId, automationId))
        .orderBy(desc(automationRuns.startedAt))
        .limit(Math.max(1, Math.min(limit, 500)))
        .all(),
    );
    return rows.map(toAutomationRun);
  });
}

function getAutomationRecord(id: string) {
  return withDatabase((database) =>
    database
      .select()
      .from(automations)
      .where(eq(automations.id, id))
      .limit(1)
      .get(),
  );
}

function hydrateAutomation(record: AutomationRow) {
  return Effect.gen(function* () {
    const runs = yield* listAutomationRunRows(record.id);
    return toAutomation(record, runs);
  });
}

function listAutomationRunRows(automationId: string) {
  return withDatabase((database) =>
    database
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.automationId, automationId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(DEFAULT_HISTORY_LIMIT)
      .all(),
  );
}

function toAutomation(
  record: AutomationRow,
  runRows: AutomationRunRow[],
): Automation {
  const runs = runRows.map(toAutomationRun);
  return {
    ...record,
    runs,
    status: automationStatus(record.enabled, runs),
  };
}

function toAutomationRun(row: AutomationRunRow): AutomationRun {
  return { ...row };
}

function automationStatus(
  enabled: boolean,
  runs: AutomationRun[],
): AutomationStatus {
  if (!enabled) return "paused";
  if (runs.some((run) => run.status === "running")) return "running";
  return runs[0]?.status === "failed" ? "failing" : "active";
}
