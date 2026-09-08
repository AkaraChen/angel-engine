import { type as arkType } from "arktype";
export interface Project {
  id: string;
  path: string;
}

export const projectFileSearchInputSchema = arkType({
  "+": "ignore",
  "limit?": "number",
  query: "string > 0",
  root: "string > 0",
});
