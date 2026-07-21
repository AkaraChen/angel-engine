import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "@angel-engine/daemon-api/projects";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import is from "@sindresorhus/is";
import { asc, eq } from "drizzle-orm";
import { Effect } from "effect";
import { projects } from "../../db/schema";
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

export function deleteProject(
  id: string,
): Effect.Effect<void, DaemonError, Db> {
  return Effect.gen(function* () {
    const projectId = yield* requireProjectId(id);
    yield* withDatabase((database) =>
      database.delete(projects).where(eq(projects.id, projectId)).run(),
    );
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
