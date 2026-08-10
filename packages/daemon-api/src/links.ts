import type { GitHubResolvedItem } from "./github";
import { type as arkType } from "arktype";

export type TaskLinkKind = "issue" | "pullRequest";

export type ParsedTaskLink =
  | {
      kind: TaskLinkKind;
      number: number;
      owner: string;
      provider: "github";
      repo: string;
      url: string;
    }
  | {
      identifier: string;
      kind: "issue";
      provider: "linear";
      team: string;
      url: string;
    };

export type ResolvedTaskLink =
  | ({ provider: "github" } & GitHubResolvedItem)
  | {
      body: string;
      contextText: string;
      identifier: string;
      kind: "issue";
      provider: "linear";
      state: string;
      team: string;
      title: string;
      url: string;
    };

export interface TaskLinkResolveInput {
  url: string;
}

export const taskLinkResolveInputSchema = arkType({
  "+": "ignore",
  url: "string > 0",
});
