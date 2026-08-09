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

/** One discovered repository pull-request template. */
export interface GitHubPullRequestTemplate {
  /** Absolute path when read from disk; null for empty default. */
  path: string | null;
  /** Relative path from the repository root, for UI display. */
  relativePath: string | null;
  body: string;
  name: string;
}

export interface GitHubPullRequestTemplateInput {
  cwd: string;
}

export interface GitHubPullRequestTemplateResult {
  /** Preferred template body for create-PR forms (empty string if none). */
  body: string;
  templates: GitHubPullRequestTemplate[];
}

export interface GitHubListPullRequestsInput {
  cwd: string;
  limit?: number;
  query?: string;
  /** open | closed | merged | all. Defaults to open. */
  state?: "open" | "closed" | "merged" | "all";
}

export interface GitHubPullRequestListItem {
  author: string | null;
  baseRefName: string;
  headRefName: string;
  isDraft: boolean;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}

export interface GitHubListPullRequestsResult {
  items: GitHubPullRequestListItem[];
}

export interface GitHubViewPullRequestInput {
  cwd: string;
  number: number;
}

export interface GitHubPullRequestComment {
  author: string | null;
  body: string;
  createdAt: string;
  id: string;
  url: string;
}

export interface GitHubPullRequestDetail {
  author: string | null;
  baseRefName: string;
  body: string;
  comments: GitHubPullRequestComment[];
  headRefName: string;
  isDraft: boolean;
  number: number;
  owner: string;
  repo: string;
  state: string;
  title: string;
  updatedAt: string;
  url: string;
}

export interface GitHubCreatePullRequestInput {
  base?: string;
  body?: string;
  cwd: string;
  draft?: boolean;
  head?: string;
  title: string;
}

export interface GitHubCreatePullRequestResult {
  number: number;
  url: string;
}

export interface GitHubAddPullRequestCommentInput {
  body: string;
  cwd: string;
  number: number;
}

export interface GitHubAddPullRequestCommentResult {
  comment: GitHubPullRequestComment;
}

export interface GitHubCreateWorkspaceFromPullRequestInput {
  number: number;
  projectId: string;
  runtime?: string;
  setupApproval?: string;
  title?: string;
}

export interface GitHubCreateWorkspaceFromPullRequestResult {
  branch: string;
  chatId: string;
  cwd: string;
  number: number;
  title: string;
  url: string;
}

export const githubResolveUrlInputSchema = arkType({
  "+": "ignore",
  url: "string > 0",
});

export const githubPullRequestTemplateInputSchema = arkType({
  "+": "ignore",
  cwd: "string > 0",
});

export const githubListPullRequestsInputSchema = arkType({
  "+": "ignore",
  cwd: "string > 0",
  "limit?": "number",
  "query?": "string",
  "state?": "'open' | 'closed' | 'merged' | 'all'",
});

export const githubViewPullRequestInputSchema = arkType({
  "+": "ignore",
  cwd: "string > 0",
  number: "number",
});

export const githubCreatePullRequestInputSchema = arkType({
  "+": "ignore",
  "base?": "string",
  "body?": "string",
  cwd: "string > 0",
  "draft?": "boolean",
  "head?": "string",
  title: "string > 0",
});

export const githubAddPullRequestCommentInputSchema = arkType({
  "+": "ignore",
  body: "string > 0",
  cwd: "string > 0",
  number: "number",
});

export const githubCreateWorkspaceFromPullRequestInputSchema = arkType({
  "+": "ignore",
  number: "number",
  projectId: "string > 0",
  "runtime?": "string",
  "setupApproval?": "string",
  "title?": "string",
});

/** An account whose repositories the authenticated user can clone. */
export interface GitHubRepositoryOwner {
  kind: GitHubRepositoryOwnerKind;
  login: string;
}

export type GitHubRepositoryOwnerKind = "organization" | "user";

export interface GitHubRepositoryOwnersResult {
  owners: GitHubRepositoryOwner[];
}

export interface GitHubListRepositoriesInput {
  limit?: number;
  owner: string;
}

export interface GitHubRepository {
  defaultBranch: string | null;
  description: string | null;
  isArchived: boolean;
  isFork: boolean;
  isPrivate: boolean;
  name: string;
  nameWithOwner: string;
  owner: string;
  pushedAt: string | null;
  url: string;
}

export interface GitHubListRepositoriesResult {
  repositories: GitHubRepository[];
}
