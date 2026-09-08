import { type as arkType } from "arktype";
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

export const projectGitStatusInputSchema = arkType({
  "+": "ignore",
  projectId: "string > 0",
});

export const projectFileSearchInputSchema = arkType({
  "+": "ignore",
  "limit?": "number",
  query: "string > 0",
  root: "string > 0",
});
