import { type as arkType } from "arktype";

export type GitHubItemKind = "issue" | "pullRequest";

export interface GitHubResolveUrlInput {
  url: string;
}

export interface GitHubResolvedItem {
  author: string | null;
  baseRefName?: string;
  body: string;
  contextText: string;
  headRefName?: string;
  isDraft?: boolean;
  kind: GitHubItemKind;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  url: string;
}

export interface GitHubListItemsInput {
  cwd: string;
  limit?: number;
  query?: string;
}

export interface GitHubListItem {
  author: string | null;
  isDraft?: boolean;
  kind: GitHubItemKind;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}

export interface GitHubListItemsResult {
  items: GitHubListItem[];
}

/** Coarse bucket from `gh pr checks --json bucket`. */
export type GitHubCheckBucket =
  | "pass"
  | "fail"
  | "pending"
  | "skipping"
  | "cancel";

export interface GitHubPrChecksInput {
  cwd: string;
}

export interface GitHubPrCheck {
  bucket: GitHubCheckBucket;
  completedAt: string | null;
  description: string | null;
  link: string | null;
  name: string;
  startedAt: string | null;
  state: string;
  workflow: string | null;
}

export interface GitHubPrRef {
  headRefName: string;
  number: number;
  title: string;
  url: string;
}

export interface GitHubPrChecksSummary {
  fail: number;
  other: number;
  pass: number;
  pending: number;
  total: number;
}

export interface GitHubPrChecksResult {
  checks: GitHubPrCheck[];
  hasPullRequest: boolean;
  pullRequest: GitHubPrRef | null;
  summary: GitHubPrChecksSummary;
}

export interface GitHubPrChecksFixPromptInput {
  checkNames?: string[];
  cwd: string;
}

export interface GitHubPrChecksFixPromptResult {
  failedCheckNames: string[];
  prompt: string;
  pullRequest: GitHubPrRef;
}

export const githubResolveUrlInputSchema = arkType({
  "+": "ignore",
  url: "string > 0",
});

export const githubPrChecksFixPromptInputSchema = arkType({
  "+": "ignore",
  "checkNames?": "string[]",
  cwd: "string > 0",
});
