export interface Project {
  id: string;
  path: string;
}

export interface DeleteProjectImpact {
  chatCount: number;
}

export interface DeleteProjectResult {
  ok: boolean;
}

export interface ProjectGitStatusInput {
  projectId: string;
}

export interface ProjectGitStatusResult {
  branch?: string;
  isDirty: boolean;
  isGitRepository: boolean;
  path: string;
  projectId: string;
  root?: string;
}

export interface ProjectWorktreeCreateInput {
  projectId: string;
}

export interface ProjectWorktreeCreateResult {
  branch: string;
  cwd: string;
  projectId: string;
  root: string;
}

export interface CreateProjectInput {
  id?: string;
  path: string;
}

export interface UpdateProjectInput {
  id: string;
  path: string;
}

const projectResponseSchema = arkType({
  "+": "ignore",
  id: "string > 0",
  path: "string > 0",
});

const deleteProjectImpactResponseSchema = arkType({
  "+": "ignore",
  chatCount: "number.integer >= 0",
});

const deleteProjectResultResponseSchema = arkType({
  "+": "ignore",
  ok: "boolean",
});

export function isProject(value: unknown): value is Project {
  return !(projectResponseSchema(value) instanceof arkType.errors);
}

export function isProjectList(value: unknown): value is Project[] {
  return !(projectResponseSchema.array()(value) instanceof arkType.errors);
}

export function isDeleteProjectImpact(
  value: unknown,
): value is DeleteProjectImpact {
  return !(deleteProjectImpactResponseSchema(value) instanceof arkType.errors);
}

export function isDeleteProjectResult(
  value: unknown,
): value is DeleteProjectResult {
  return !(deleteProjectResultResponseSchema(value) instanceof arkType.errors);
}

export const createProjectInputSchema = arkType({
  "+": "ignore",
  "id?": "string",
  path: "string > 0",
});

export const projectFileSearchInputSchema = arkType({
  "+": "ignore",
  "limit?": "number",
  query: "string > 0",
  root: "string > 0",
});

export const projectGitStatusInputSchema = arkType({
  "+": "ignore",
  projectId: "string > 0",
});

export const updateProjectInputSchema = arkType({
  "+": "ignore",
  id: "string > 0",
  path: "string > 0",
});
import { type as arkType } from "arktype";
