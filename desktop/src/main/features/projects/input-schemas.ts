import type { ProjectFileSearchInput } from "../../../shared/chat";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../../../shared/projects";
import { parseObjectInput, parseStringInput } from "../../ipc/validation";
import {
  createProjectInput,
  projectFileSearchInput,
  updateProjectInput,
} from "./schemas";

export function parseCreateProjectInput(input: unknown): CreateProjectInput {
  const value = parseObjectInput(
    createProjectInput,
    input,
    "Project input is required.",
  );

  return {
    id: value.id,
    path: value.path,
  };
}

export function parseProjectFileSearchInput(
  input: unknown,
): ProjectFileSearchInput {
  const value = parseObjectInput(
    projectFileSearchInput,
    input,
    "Project file search input is required.",
  );

  return {
    limit:
      typeof value.limit === "number" && Number.isFinite(value.limit)
        ? value.limit
        : undefined,
    query: value.query,
    root: value.root,
  };
}

export function parseProjectId(input: unknown): string {
  return parseStringInput(input, "Project id is required.");
}

export function parseUpdateProjectInput(input: unknown): UpdateProjectInput {
  const value = parseObjectInput(
    updateProjectInput,
    input,
    "Project input is required.",
  );

  return {
    id: value.id,
    path: value.path,
  };
}
