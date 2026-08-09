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

export const githubResolveUrlInputSchema = arkType({
  "+": "ignore",
  url: "string > 0",
});

/** An account whose repositories the authenticated user can clone. */
export interface GitHubRepositoryOwner {
  avatarUrl: string | null;
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
