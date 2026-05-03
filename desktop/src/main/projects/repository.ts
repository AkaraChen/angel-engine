import BetterSqliteDatabase from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { asc, eq } from 'drizzle-orm';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '../../shared/projects';
import { projects } from '../db/schema';

type AppDatabase = BetterSQLite3Database<{ projects: typeof projects }>;

let sqlite: BetterSqliteDatabase.Database | undefined;
let db: AppDatabase | undefined;

function getDatabase() {
  if (db) return db;

  const dbDirectory = app.getPath('userData');
  fs.mkdirSync(dbDirectory, { recursive: true });

  sqlite = new BetterSqliteDatabase(path.join(dbDirectory, 'angel-engine.sqlite'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY NOT NULL,
      path TEXT NOT NULL UNIQUE
    );
  `);

  db = drizzle(sqlite, { schema: { projects } });
  return db;
}

export function listProjects(): Project[] {
  return getDatabase().select().from(projects).orderBy(asc(projects.path)).all();
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
    throw new Error('Project not found.');
  }

  return project;
}

export function deleteProject(id: string): void {
  getDatabase().delete(projects).where(eq(projects.id, requireProjectId(id))).run();
}

export function closeProjectsDatabase() {
  sqlite?.close();
  sqlite = undefined;
  db = undefined;
}

function requireProjectId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) {
    throw new Error('Project id is required.');
  }
  return trimmed;
}

function normalizeProjectPath(projectPath: string) {
  const trimmed = projectPath.trim();
  if (!trimmed) {
    throw new Error('Project path is required.');
  }

  const resolvedPath = path.resolve(trimmed);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error('Project path does not exist.');
  }

  if (!fs.statSync(resolvedPath).isDirectory()) {
    throw new Error('Project path must be a directory.');
  }

  return resolvedPath;
}
