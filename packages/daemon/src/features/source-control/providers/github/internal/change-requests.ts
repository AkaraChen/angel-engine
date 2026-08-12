import type {
  ChangeRequest,
  ChangeRequestHeadResult,
  ChangeRequestStatusResult,
  ListOperationInput,
  MergeMethod,
  MergeRequirement,
  NumberedItemInput,
  ProviderOperationContext,
  RepositoryIdentity,
  ReviewDecision,
  UrlOperationInput,
} from "@angel-engine/daemon-api/source-control";
import is from "@sindresorhus/is";
import { type as arkType } from "arktype";

import { DaemonError } from "../../../../../platform/errors";
import {
  findGhPath,
  type GhRunner,
  mapGhFailure,
  normalizeText,
  runGhCli,
} from "./gh-cli";
import { parseGitHubRepositoryUrl, parseGitHubUrl } from "./resolve";

const MAX_LIMIT = 100;
const positiveInteger = arkType("number.integer > 0");
const nonNegativeInteger = arkType("number.integer >= 0");
const nullableString = arkType("string").or("null");
const actorSchema = arkType({
  "+": "ignore",
  "avatarUrl?": nullableString,
  "id?": nullableString,
  login: "string > 0",
  "name?": nullableString,
  "url?": nullableString,
}).or("null");
const changeRequestPayloadSchema = arkType({
  "+": "ignore",
  additions: nonNegativeInteger,
  author: actorSchema,
  baseRefName: "string > 0",
  body: "string | null",
  changedFiles: nonNegativeInteger,
  commits: "unknown[]",
  createdAt: "string > 0",
  deletions: nonNegativeInteger,
  headRefName: "string > 0",
  "headRefOid?": nullableString,
  "headRepository?": arkType({
    "+": "ignore",
    nameWithOwner: /^([^/]+)\/([^/]+)$/,
    url: "string > 0",
  }).or("null"),
  isDraft: "boolean",
  mergeable: "'CONFLICTING' | 'MERGEABLE' | 'UNKNOWN'",
  mergeStateStatus: "string > 0",
  mergedAt: nullableString,
  number: positiveInteger,
  reviewDecision: arkType(
    "'' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'",
  ).or("null"),
  state: "'CLOSED' | 'MERGED' | 'OPEN'",
  title: "string > 0",
  updatedAt: "string > 0",
  url: "string > 0",
});
const listPayloadSchema = changeRequestPayloadSchema.array();
const repositoryPayloadSchema = arkType({
  "+": "ignore",
  mergeCommitAllowed: "boolean",
  nameWithOwner: /^([^/]+)\/([^/]+)$/,
  rebaseMergeAllowed: "boolean",
  squashMergeAllowed: "boolean",
  viewerPermission: "string",
});

const CHANGE_REQUEST_FIELDS = [
  "additions",
  "author",
  "baseRefName",
  "body",
  "changedFiles",
  "commits",
  "createdAt",
  "deletions",
  "headRefName",
  "headRefOid",
  "headRepository",
  "isDraft",
  "mergeable",
  "mergeStateStatus",
  "mergedAt",
  "number",
  "reviewDecision",
  "state",
  "title",
  "updatedAt",
  "url",
].join(",");
const REPOSITORY_FIELDS = [
  "mergeCommitAllowed",
  "nameWithOwner",
  "rebaseMergeAllowed",
  "squashMergeAllowed",
  "viewerPermission",
].join(",");

interface GitHubChangeRequestDependencies {
  findGh?: () => Promise<string | null>;
  runGh?: GhRunner;
}

export async function getGitHubChangeRequest(
  input: NumberedItemInput,
  _context: ProviderOperationContext,
  dependencies: GitHubChangeRequestDependencies = {},
): Promise<ChangeRequest> {
  const repository = requireGitHubRepository(input.repository);
  return fetchChangeRequest(
    ["pr", "view", input.id, "--repo", repository.displayPath],
    repository,
    dependencies,
  );
}

export async function getGitHubChangeRequestByUrl(
  input: UrlOperationInput,
  _context: ProviderOperationContext,
  dependencies: GitHubChangeRequestDependencies = {},
): Promise<ChangeRequest> {
  const parsed = parseGitHubUrl(input.url);
  if (parsed?.kind !== "pullRequest") {
    throw DaemonError.sourceControlUrlUnsupported(
      "Only GitHub pull request URLs are supported for change requests.",
    );
  }
  const repository = parseGitHubRepositoryUrl(parsed.url);
  if (repository === null) throw unexpectedPayload(parsed.url);
  return fetchChangeRequest(
    ["pr", "view", parsed.url],
    repository,
    dependencies,
  );
}

export async function listGitHubChangeRequests(
  input: ListOperationInput,
  _context: ProviderOperationContext,
  dependencies: GitHubChangeRequestDependencies = {},
): Promise<readonly ChangeRequest[]> {
  const repository = requireGitHubRepository(input.repository);
  const search = input.query?.trim() ?? "";
  const args = [
    "pr",
    "list",
    "--repo",
    repository.displayPath,
    "--state",
    "all",
    "--limit",
    String(Math.min(input.limit, MAX_LIMIT)),
    "--json",
    CHANGE_REQUEST_FIELDS,
  ];
  if (search.length > 0) args.push("--search", search);
  const output = await runGh(args, dependencies);
  const payload = parsePayload(listPayloadSchema, output.stdout);
  return payload.map((entry) => toChangeRequest(entry, repository));
}

export async function getGitHubChangeRequestStatus(
  input: NumberedItemInput,
  context: ProviderOperationContext,
  dependencies: GitHubChangeRequestDependencies = {},
): Promise<ChangeRequestStatusResult> {
  const repository = requireGitHubRepository(input.repository);
  const [changeRequest, repositoryOutput] = await Promise.all([
    getGitHubChangeRequest(input, context, dependencies),
    runGh(
      ["repo", "view", repository.displayPath, "--json", REPOSITORY_FIELDS],
      dependencies,
    ),
  ]);
  const policy = parsePayload(repositoryPayloadSchema, repositoryOutput.stdout);
  const allowedMergeMethods = allowedMethods(policy);
  return {
    changeRequest: {
      ...changeRequest,
      allowedMergeMethods,
      defaultMergeMethod: allowedMergeMethods[0] ?? null,
      viewerCanMerge: ["ADMIN", "MAINTAIN", "WRITE"].includes(
        policy.viewerPermission,
      ),
    },
    // Check normalization is introduced in P5; fail closed until then.
    checks: null,
  };
}

export async function resolveGitHubChangeRequestHead(
  input: NumberedItemInput,
  context: ProviderOperationContext,
  dependencies: GitHubChangeRequestDependencies = {},
): Promise<ChangeRequestHeadResult> {
  const changeRequest = await getGitHubChangeRequest(
    input,
    context,
    dependencies,
  );
  const github = changeRequest.extensions?.github;
  const headRepositoryUrl =
    typeof github === "object" &&
    github !== null &&
    "headRepositoryUrl" in github &&
    is.string(github.headRepositoryUrl)
      ? github.headRepositoryUrl
      : null;
  return {
    changeRequest,
    remoteUrl:
      headRepositoryUrl ??
      `${changeRequest.repository.webUrl ?? `https://github.com/${changeRequest.repository.displayPath}`}.git`,
    ref: changeRequest.source.name,
  };
}

async function fetchChangeRequest(
  args: string[],
  repository: RepositoryIdentity,
  dependencies: GitHubChangeRequestDependencies,
) {
  const output = await runGh(
    [...args, "--json", CHANGE_REQUEST_FIELDS],
    dependencies,
  );
  return toChangeRequest(
    parsePayload(changeRequestPayloadSchema, output.stdout),
    repository,
  );
}

async function runGh(
  args: string[],
  dependencies: GitHubChangeRequestDependencies,
) {
  const ghPath = await (dependencies.findGh ?? findGhPath)().catch((cause) => {
    throw DaemonError.sourceControlFetchFailed(cause);
  });
  if (!is.nonEmptyString(ghPath)) throw DaemonError.sourceControlCliMissing();
  return (dependencies.runGh ?? runGhCli)(args).catch((cause) => {
    throw mapGhFailure(cause);
  });
}

function toChangeRequest(
  payload: typeof changeRequestPayloadSchema.infer,
  expectedRepository: RepositoryIdentity,
): ChangeRequest {
  const parsed = parseGitHubUrl(payload.url);
  if (
    parsed?.kind !== "pullRequest" ||
    parsed.number !== payload.number ||
    parsed.owner !== expectedRepository.namespace[0] ||
    parsed.repo !== expectedRepository.name
  ) {
    throw unexpectedPayload(payload.url);
  }
  const repository = parseGitHubRepositoryUrl(payload.url);
  if (repository === null) throw unexpectedPayload(payload.url);
  const sourceRepository = payload.headRepository
    ? (parseGitHubRepositoryUrl(payload.headRepository.url) ?? repository)
    : repository;
  return {
    id: String(payload.number),
    number: payload.number,
    repository,
    title: payload.title,
    body: normalizeText(payload.body ?? ""),
    author: payload.author
      ? {
          id: payload.author.id ?? null,
          login: payload.author.login,
          displayName: payload.author.name ?? null,
          avatarUrl: payload.author.avatarUrl ?? null,
          webUrl: payload.author.url ?? null,
        }
      : null,
    state: normalizeState(payload.state),
    draft: payload.isDraft,
    source: {
      name: payload.headRefName,
      oid: payload.headRefOid ?? null,
      repository: sourceRepository,
    },
    target: { name: payload.baseRefName, oid: null, repository },
    webUrl: parsed.url,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
    mergedAt: payload.mergedAt,
    additions: payload.additions,
    deletions: payload.deletions,
    changedFiles: payload.changedFiles,
    commitCount: payload.commits.length,
    reviewDecision: normalizeReviewDecision(payload.reviewDecision),
    mergeRequirements: mergeRequirements(payload),
    allowedMergeMethods: [],
    defaultMergeMethod: null,
    viewerCanMerge: null,
    extensions: {
      github: {
        headRepositoryUrl: payload.headRepository?.url ?? null,
        mergeable: payload.mergeable,
        mergeStateStatus: payload.mergeStateStatus,
        state: payload.state,
      },
    },
  };
}

function mergeRequirements(payload: {
  isDraft: boolean;
  mergeable: "CONFLICTING" | "MERGEABLE" | "UNKNOWN";
  mergeStateStatus: string;
  reviewDecision:
    | ""
    | "APPROVED"
    | "CHANGES_REQUESTED"
    | "REVIEW_REQUIRED"
    | null;
}): readonly MergeRequirement[] {
  return [
    {
      id: "draft",
      kind: "draft",
      state: payload.isDraft ? "unsatisfied" : "satisfied",
      blocking: payload.isDraft,
      label: payload.isDraft ? "Mark ready for review" : "Ready for review",
      detailsUrl: null,
    },
    {
      id: "conflict",
      kind: "conflict",
      state:
        payload.mergeable === "UNKNOWN"
          ? "pending"
          : payload.mergeable === "CONFLICTING"
            ? "unsatisfied"
            : "satisfied",
      blocking: payload.mergeable === "CONFLICTING",
      label: "No merge conflicts",
      detailsUrl: null,
    },
    {
      id: "review-approval",
      kind: "review-approval",
      state:
        payload.reviewDecision === "APPROVED"
          ? "satisfied"
          : payload.reviewDecision === null || payload.reviewDecision === ""
            ? "not-applicable"
            : "unsatisfied",
      blocking:
        payload.reviewDecision === "CHANGES_REQUESTED" ||
        payload.reviewDecision === "REVIEW_REQUIRED",
      label: "Required reviews approved",
      detailsUrl: null,
    },
    {
      id: "branch-up-to-date",
      kind: "branch-up-to-date",
      state:
        payload.mergeStateStatus === "BEHIND"
          ? "unsatisfied"
          : payload.mergeStateStatus === "UNKNOWN"
            ? "pending"
            : "satisfied",
      blocking: payload.mergeStateStatus === "BEHIND",
      label: "Branch is up to date",
      detailsUrl: null,
    },
  ];
}

function normalizeState(state: "CLOSED" | "MERGED" | "OPEN") {
  return state.toLowerCase() as ChangeRequest["state"];
}

function normalizeReviewDecision(
  decision: "" | "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null,
): ReviewDecision {
  if (decision === "APPROVED") return "approved";
  if (decision === "CHANGES_REQUESTED") return "changes-requested";
  if (decision === "REVIEW_REQUIRED") return "review-required";
  return "none";
}

function allowedMethods(repository: {
  mergeCommitAllowed: boolean;
  rebaseMergeAllowed: boolean;
  squashMergeAllowed: boolean;
}): readonly MergeMethod[] {
  const methods: MergeMethod[] = [];
  if (repository.squashMergeAllowed) methods.push("squash");
  if (repository.mergeCommitAllowed) methods.push("merge");
  if (repository.rebaseMergeAllowed) methods.push("rebase");
  return methods;
}

function requireGitHubRepository(repository: RepositoryIdentity) {
  if (repository.providerId !== "github" || repository.namespace.length !== 1) {
    throw DaemonError.invalidRequest("A GitHub repository is required.");
  }
  return repository;
}

function parsePayload<T>(
  schema: (value: unknown) => T | arkType.errors,
  stdout: string,
): T {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch (cause) {
    throw DaemonError.sourceControlFetchFailed(
      cause,
      "GitHub CLI returned invalid JSON.",
    );
  }
  const payload = schema(json);
  if (payload instanceof arkType.errors)
    throw unexpectedPayload(payload.summary);
  return payload;
}

function unexpectedPayload(detail: string) {
  return DaemonError.sourceControlFetchFailed(
    new TypeError(`Unexpected GitHub CLI pull request payload: ${detail}`),
  );
}
