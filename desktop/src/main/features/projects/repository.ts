import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";

import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from "../../../shared/projects";
import { projects } from "../../db/schema";
import { closeDatabase, getDatabase } from "../../db/database";

export function listProjects(): Project[] {
  return getDatabase()
    .select()
    .from(projects)
    .orderBy(asc(projects.path))
    .all();
}

export function getProject(id: string): Project | null {
  const project = getDatabase()
    .select()
    .from(projects)
    .where(eq(projects.id, requireProjectId(id)))
    .limit(1)
    .get();

  return project ?? null;
}

export function createProject(input: CreateProjectInput): Project {
  const nextProject = {
    id: input.id?.trim() || randomUUID(),
    path: normalizeProjectPath(input.path),
  };

  const project = getDatabase()
    .insert(projects)
    .values(nextProject)
    .returning()
    .get();
  return project;
}

export function updateProject(input: UpdateProjectInput): Project {
  const project = getDatabase()
    .update(projects)
    .set({ path: normalizeProjectPath(input.path) })
    .where(eq(projects.id, requireProjectId(input.id)))
    .returning()
    .get();

  if (!project) {
    throw new Error("Project not found.");
  }

  return project;
}

export function deleteProject(id: string): void {
  getDatabase()
    .delete(projects)
    .where(eq(projects.id, requireProjectId(id)))
    .run();
}

export function closeProjectsDatabase() {
  closeDatabase();
}

function requireProjectId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error("Project id is required.");
  }
  return trimmed;
}

function normalizeProjectPath(projectPath: string) {
  const trimmed = projectPath.trim();
  if (!trimmed) {
    throw new Error("Project path is required.");
  }

  const resolvedPath = path.resolve(trimmed);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error("Project path does not exist.");
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error("Project path must be a directory.");
  }

  return resolvedPath;
}
