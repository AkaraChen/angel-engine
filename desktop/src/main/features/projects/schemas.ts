import { type } from "arktype";

export const createProjectInput = type({
  "+": "ignore",
  "id?": "string",
  path: "string > 0",
});

export const projectFileSearchInput = type({
  "+": "ignore",
  "limit?": "number",
  "query?": "string",
  root: "string > 0",
});

export const updateProjectInput = type({
  "+": "ignore",
  id: "string > 0",
  path: "string > 0",
});
