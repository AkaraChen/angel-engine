import { type as arkType } from "arktype";

import type { ProjectFileSearchInput } from "../../../shared/chat";
import type {
  CreateProjectInput,
  UpdateProjectInput,
} from "../../../shared/projects";
import { parseObjectInput, parseStringInput } from "../../ipc/validation";

const createProjectInput = arkType({
  "+": "ignore",
  "id?": "unknown",
  "path?": "unknown",
});

const projectFileSearchInput = arkType({
  "+": "ignore",
  "limit?": "unknown",
  "query?": "unknown",
  "root?": "unknown",
});

const updateProjectInput = arkType({
  "+": "ignore",
  "id?": "unknown",
  "path?": "unknown",
});

export function parseCreateProjectInput(input: unknown): CreateProjectInput {
  const value = parseObjectInput(
    createProjectInput,
    input,
    "Project input is required.",
  );

  return {
    id: typeof value.id === "string" ? value.id : undefined,
    path: parseStringInput(value.path, "Project path is required."),
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
    limit: normalizeOptionalFiniteNumber(value.limit),
    query: typeof value.query === "string" ? value.query : undefined,
    root: parseStringInput(value.root, "Project path is required."),
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
    id: parseProjectId(value.id),
    path: parseStringInput(value.path, "Project path is required."),
  };
}

function normalizeOptionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
}
