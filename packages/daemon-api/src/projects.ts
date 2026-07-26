export interface Project {
  id: string;
  path: string;
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

/** Name of the per-project settings file, relative to the repository root. */
export const PROJECT_CONFIG_FILE_NAME = "2code.json";

/**
 * Per-project settings persisted in the repository's `2code.json`. The file is
 * the single source of truth; the daemon never mirrors these values into its
 * database.
 */
export interface ProjectConfig {
  /** Commands run in a freshly created worktree, in order. */
  setupScript: string[];
}

export interface ProjectConfigResult extends ProjectConfig {
  /** Absolute path of the `2code.json` the values were read from. */
  configPath: string;
  /** `false` when no `2code.json` exists yet, so saving will create it. */
  exists: boolean;
  projectId: string;
}

export interface ProjectConfigInput {
  projectId: string;
}

export interface UpdateProjectConfigInput extends ProjectConfig {
  projectId: string;
}

export interface CreateProjectInput {
  id?: string;
  path: string;
}

export interface UpdateProjectInput {
  id: string;
  path: string;
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

export const updateProjectConfigInputSchema = arkType({
  "+": "ignore",
  projectId: "string > 0",
  setupScript: "string[]",
});

export const updateProjectInputSchema = arkType({
  "+": "ignore",
  id: "string > 0",
  path: "string > 0",
});
import { type as arkType } from "arktype";
