import type {
  CreateProjectInput,
  Project,
  ProjectDeleteImpact,
  ProjectDeleteInput,
  UpdateProjectInput,
} from "@angel-engine/daemon-api/projects";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import is from "@sindresorhus/is";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { type ChatRow, chats, projects } from "../../db/schema";
import { type Db, withDatabase } from "../../platform/db";
import { DaemonError } from "../../platform/errors";

export function listProjects() {
  return withDatabase((database) =>
    database.select().from(projects).orderBy(asc(projects.path)).all(),
  );
}

export function getProject(
  id: string,
): Effect.Effect<Project | null, DaemonError, Db> {
  return Effect.gen(function* () {
    const projectId = yield* requireProjectId(id);
    const project = yield* withDatabase((database) =>
      database
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
        .get(),
    );
    return project ?? null;
  });
}

export function createProject(
  input: CreateProjectInput,
): Effect.Effect<Project, DaemonError, Db> {
  return Effect.gen(function* () {
    const nextProject = {
      id: is.nonEmptyString(input.id) ? input.id : randomUUID(),
      path: yield* normalizeProjectPath(input.path),
    };

    return yield* withDatabase((database) =>
      database.insert(projects).values(nextProject).returning().get(),
    );
  });
}

export function updateProject(
  input: UpdateProjectInput,
): Effect.Effect<Project, DaemonError, Db> {
  return Effect.gen(function* () {
    const projectId = yield* requireProjectId(input.id);
    const projectPath = yield* normalizeProjectPath(input.path);
    const project = yield* withDatabase((database) =>
      database
        .update(projects)
        .set({ path: projectPath })
        .where(eq(projects.id, projectId))
        .returning()
        .get(),
    );

    if (is.falsy(project)) {
      return yield* Effect.fail(DaemonError.projectNotFound());
    }

    return project;
  });
}

/**
 * Opaque revision of the exact linked-chat set for a project. Any change to
 * that set (chat created, deleted, or re-linked) produces a different token,
 * so a delete carrying a stale revision can be rejected before any row is
 * removed.
 */
export function projectDeleteRevision(chatIds: string[]): string {
  return createHash("sha256")
    .update(JSON.stringify([...chatIds].sort()))
    .digest("hex");
}

export function getProjectDeleteImpact(
  id: string,
): Effect.Effect<ProjectDeleteImpact, DaemonError, Db> {
  return Effect.gen(function* () {
    const projectId = yield* requireProjectId(id);
    const project = yield* withDatabase((database) =>
      database
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1)
        .get(),
    );
    if (project === undefined) {
      return yield* Effect.fail(DaemonError.projectNotFound());
    }
    const linkedChatIds = yield* withDatabase((database) =>
      database
        .select({ id: chats.id })
        .from(chats)
        .where(eq(chats.projectId, projectId))
        .all()
        .then((rows) => rows.map((row) => row.id)),
    );
    return {
      chatCount: linkedChatIds.length,
      revision: projectDeleteRevision(linkedChatIds),
    };
  });
}

type ProjectDeleteTxResult =
  | { status: "conflict" }
  | { status: "deleted"; deletedChats: ChatRow[] }
  | { status: "not-found" };

/**
 * Deletes a project and its linked chats only when the exact linked-chat set
 * still matches the revision the caller confirmed. The revision check and the
 * deletes run in one transaction so a concurrently-created chat can never be
 * removed by a confirmation that did not name it.
 */
export function deleteProjectWithChats(
  input: ProjectDeleteInput,
): Effect.Effect<ChatRow[], DaemonError, Db> {
  return Effect.gen(function* () {
    const projectId = yield* requireProjectId(input.id);
    const result = yield* withDatabase((database) =>
      database.transaction(async (tx): Promise<ProjectDeleteTxResult> => {
        const linkedChats = await tx
          .select()
          .from(chats)
          .where(eq(chats.projectId, projectId))
          .all();
        const revision = projectDeleteRevision(
          linkedChats.map((chat) => chat.id),
        );
        if (revision !== input.expectedRevision) return { status: "conflict" };
        if (linkedChats.length > 0) {
          await tx.delete(chats).where(eq(chats.projectId, projectId)).run();
        }
        const deletedProject = await tx
          .delete(projects)
          .where(eq(projects.id, projectId))
          .returning()
          .get();
        if (deletedProject === undefined) return { status: "not-found" };
        return { deletedChats: linkedChats, status: "deleted" };
      }),
    );
    if (result.status === "conflict") {
      return yield* Effect.fail(DaemonError.projectDeleteConflict());
    }
    if (result.status === "not-found") {
      return yield* Effect.fail(DaemonError.projectNotFound());
    }
    return result.deletedChats;
  });
}

function requireProjectId(id: string): Effect.Effect<string, DaemonError> {
  if (!id) {
    return Effect.fail(DaemonError.projectIdRequired());
  }
  return Effect.succeed(id);
}

function normalizeProjectPath(
  projectPath: string,
): Effect.Effect<string, DaemonError> {
  return Effect.gen(function* () {
    if (!projectPath) {
      return yield* Effect.fail(
        DaemonError.projectPathInvalid("Project path is required."),
      );
    }

    const resolvedPath = path.resolve(projectPath);
    if (!fs.existsSync(resolvedPath)) {
      return yield* Effect.fail(
        DaemonError.projectPathInvalid("Project path does not exist."),
      );
    }

    if (!fs.statSync(resolvedPath).isDirectory()) {
      return yield* Effect.fail(
        DaemonError.projectPathInvalid("Project path must be a directory."),
      );
    }

    return resolvedPath;
  });
}
