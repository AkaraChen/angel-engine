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
import { closeDatabase, getDatabase } from "../../db/client";
import { projects } from "../../db/schema";

export async function listProjects(): Promise<Project[]> {
  const database = await getDatabase();
  return database.select().from(projects).orderBy(asc(projects.path)).all();
}

export async function getProject(id: string): Promise<Project | null> {
  const database = await getDatabase();
  const project = await database
    .select()
    .from(projects)
    .where(eq(projects.id, requireProjectId(id)))
    .limit(1)
    .get();

  return project ?? null;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<Project> {
  const nextProject = {
    id: is.nonEmptyString(input.id) ? input.id : randomUUID(),
    path: normalizeProjectPath(input.path),
  };

  const database = await getDatabase();
  const project = await database
    .insert(projects)
    .values(nextProject)
    .returning()
    .get();
  return project;
}

export async function updateProject(
  input: UpdateProjectInput,
): Promise<Project> {
  const database = await getDatabase();
  const project = await database
    .update(projects)
    .set({ path: normalizeProjectPath(input.path) })
    .where(eq(projects.id, requireProjectId(input.id)))
    .returning()
    .get();

  if (is.falsy(project)) {
    throw new Error("Project not found.");
  }

  return project;
}

export async function deleteProject(id: string): Promise<void> {
  const database = await getDatabase();
  await database
    .delete(projects)
    .where(eq(projects.id, requireProjectId(id)))
    .run();
}

export async function closeProjectsDatabase() {
  await closeDatabase();
}

function requireProjectId(id: string) {
  if (!id) {
    throw new Error("Project id is required.");
  }
  return id;
}

function normalizeProjectPath(projectPath: string) {
  if (!projectPath) {
    throw new Error("Project path is required.");
  }

  const resolvedPath = path.resolve(projectPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error("Project path does not exist.");
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error("Project path must be a directory.");
  }

  return resolvedPath;
}
