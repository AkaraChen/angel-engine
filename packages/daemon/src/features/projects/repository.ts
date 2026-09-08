import type { Project } from "@angel-engine/daemon-api/projects";
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

function requireProjectId(id: string): Effect.Effect<string, DaemonError> {
  if (!id) {
    return Effect.fail(DaemonError.projectIdRequired());
  }
  return Effect.succeed(id);
}
