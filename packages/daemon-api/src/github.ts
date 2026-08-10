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
  isCrossRepository?: boolean;
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

/** Input for PR checks snapshot / review-thread fetch. */
export interface GitHubPrContextInput {
  cwd: string;
  owner: string;
  prNumber: number;
  repo: string;
}

export type GitHubChecksInput = GitHubPrContextInput;
export type GitHubReviewThreadsInput = GitHubPrContextInput;

/**
 * One check/status from a PR's statusCheckRollup.
 * `checkRunId` + `attempt` form the shepherd dedupe fingerprint.
 */
export interface GitHubCheckItem {
  /** GitHub Actions / Check Run numeric id as string; null for legacy StatusContext. */
  checkRunId: string | null;
  /**
   * Re-run attempt number when known (parsed from details URL), else 1.
   * Re-runs usually mint a new checkRunId, so id alone is often enough;
   * attempt is kept for the `checkRunId:attempt` fingerprint shape.
   */
  attempt: number;
  name: string;
  /** CheckRun status (COMPLETED, IN_PROGRESS, …) or StatusContext state. */
  status: string;
  /** CheckRun conclusion when completed; null while pending. StatusContext: same as status. */
  conclusion: string | null;
  isRequired: boolean;
  isPending: boolean;
  detailsUrl: string | null;
  workflowName: string | null;
  /** Workflow run database id when available — used by failure-log fetch. */
  workflowRunId: string | null;
}

export interface GitHubChecksSnapshot {
  checks: GitHubCheckItem[];
  hasPending: boolean;
  /** True when every required check is non-pending and not failing. */
  requiredAllGreen: boolean;
  /** Required checks that failed (blocking). */
  failedRequired: GitHubCheckItem[];
  /** All failed checks (required + optional) for UI. */
  failed: GitHubCheckItem[];
  headOid: string | null;
}

export interface GitHubReviewThreadComment {
  id: string;
  author: string | null;
  body: string;
  path: string | null;
  line: number | null;
  createdAt: string;
}

export interface GitHubReviewThread {
  id: string;
  isResolved: boolean;
  path: string | null;
  line: number | null;
  comments: GitHubReviewThreadComment[];
}

export interface GitHubReviewThreadsResult {
  /** All threads (resolved + unresolved) for UI counts. */
  threads: GitHubReviewThread[];
  unresolved: GitHubReviewThread[];
  unresolvedCount: number;
  resolvedCount: number;
}

export interface GitHubFailureLogInput {
  cwd: string;
  /** Workflow run id (`gh run view <id>`). */
  runId: string | number;
  /** Optional explicit repo for when cwd is not a git checkout. */
  repo?: string;
}

export interface GitHubFailureLogResult {
  /** Trailing lines of failed-job logs (capped). */
  lines: string[];
  truncated: boolean;
}

export const githubPrContextInputSchema = arkType({
  "+": "ignore",
  cwd: "string > 0",
  owner: "string > 0",
  prNumber: "number",
  repo: "string > 0",
});

export const githubFailureLogInputSchema = arkType({
  "+": "ignore",
  cwd: "string > 0",
  runId: "string | number",
  "repo?": "string",
});
