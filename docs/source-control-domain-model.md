# Provider-neutral source-control domain model

This document records the Stage 1 contract decisions and the complete coverage of the Stage 0 GitHub API surface. The contracts live in `packages/daemon-api/src/source-control/`; they are data-only and do not migrate provider implementations or renderer merge-blocker logic.

## Repository identity

`RepositoryIdentity.namespace` is an ordered array of every path segment above the repository. It represents GitHub as `[owner]`, Azure DevOps as `[organization, project]`, and GitLab as an arbitrarily deep group/subgroup path. Consumers must use `repositoryKey(identity)` and must not destructure an assumed owner or assert a fixed namespace length. `remoteId` carries a stable provider id when paths can be renamed; `displayPath` is presentation-only and must never be parsed.

Provider-specific data belongs below a named extension object such as `extensions.github`, `extensions.gitlab`, or `extensions.azureDevOps`. Strict schemas reject provider-specific fields at the top level.

## Checks and merge requirements

`CheckRun` represents a leaf job/check and `CheckGroup` represents its workflow, pipeline, stage, or policy-set grouping. GitLab fixtures prove that the contract retains a new id for a retried job (`retryOf` plus `attempt`), distinguishes a waiting manual job, and preserves `allowFailure`. GitLab cannot supply a truthful per-job required boolean, so `requiredness` is three-state and provider-computed `blocking` controls merge impact. `CheckSummary.requiredAllGreen` is likewise provider-computed.

Azure policy evaluations are broader than CI. Only a Build policy corresponds to a check; reviewer, comment, work-item, and merge-strategy policies map to `MergeRequirement`. The fixture suite covers all five classes and retains Azure `configurationId` in `extensions.azureDevOps`. This contract does not move the existing `derive-merge-blockers.ts` implementation in Stage 1.

## Capability negotiation

`CapabilityMatrix` is JSON-serializable runtime data carried by `ProviderActivation`. A missing entry is deliberately interpreted as unsupported with `unknown-capability`; this makes daemon/renderer version skew fail closed. The round-trip tests serialize an activation through JSON and validate the result against the arkType schema.

## Legacy export coverage

The table is executable evidence: `coverage.test.ts` extracts the real exports from `github.ts`, requires exactly these 71 names, and verifies that every row below exists. Adapter-local operation inputs are deferred to the Stage 3 plugin contract, but every domain datum they carry has a neutral destination.

| Legacy export | Neutral destination or disposition |
| --- | --- |
| `GitHubItemKind` | `WorkItemKind + ChangeRequestState` |
| `GitHubResolveUrlInput` | `Stage 3 resolve input; URL remains an adapter boundary` |
| `GitHubResolvedItem` | `WorkItem \| ChangeRequest + extensions.github` |
| `GitHubListItemsInput` | `Stage 3 list input; cwd/query/limit stay adapter-local` |
| `GitHubListItem` | `WorkItem \| ChangeRequest summary` |
| `GitHubListItemsResult` | `WorkItem[] \| ChangeRequest[]` |
| `GitHubCheckBucket` | `CheckRunStatus + CheckRunConclusion` |
| `GitHubPrChecksInput` | `RepositoryIdentity + Stage 3 operation context` |
| `GitHubPrCheck` | `CheckRun` |
| `GitHubPrRef` | `ChangeRequest` |
| `GitHubPullRequestTemplate` | `Stage 3 template capability payload` |
| `GitHubPullRequestTemplateInput` | `Stage 3 template operation context` |
| `GitHubPullRequestTemplateResult` | `Stage 3 template capability payload` |
| `GitHubListPullRequestsInput` | `Stage 3 changeRequests.list input` |
| `GitHubPullRequestListItem` | `ChangeRequest` |
| `GitHubListPullRequestsResult` | `ChangeRequest[]` |
| `GitHubViewPullRequestInput` | `RepositoryIdentity + change request id` |
| `GitHubPullRequestComment` | `ReviewComment + extensions.github` |
| `GitHubPullRequestDetail` | `ChangeRequest + ReviewComment[]` |
| `GitHubCreatePullRequestInput` | `Stage 3 changeRequests.create input` |
| `GitHubCreatePullRequestResult` | `ChangeRequest identity and webUrl` |
| `GitHubAddPullRequestCommentInput` | `Stage 3 changeRequests.comment input` |
| `GitHubAddPullRequestCommentResult` | `ReviewComment` |
| `GitHubCreateWorkspaceFromPullRequestInput` | `Stage 3 workspace operation input` |
| `GitHubCreateWorkspaceFromPullRequestResult` | `ChangeRequest + local workspace result` |
| `GitHubPrChecksSummary` | `CheckSummary` |
| `GitHubPrChecksResult` | `CheckSummary + ChangeRequest` |
| `GitHubPrChecksFixPromptInput` | `Stage 3 checks failure-log operation input` |
| `GitHubPrChecksFixPromptResult` | `CheckSummary + ChangeRequest + prompt` |
| `GitHubMergeMethod` | `MergeMethod` |
| `GitHubPullRequestStatusInput` | `RepositoryIdentity + change request id` |
| `GitHubPullRequestCheck` | `CheckRun` |
| `GitHubPullRequestReviewThread` | `ReviewThread + ReviewComment` |
| `GitHubPullRequestStatus` | `ChangeRequest + CheckSummary + MergeRequirement[]` |
| `GitHubMergeInput` | `MergeMethod + Stage 3 changeRequests.merge input` |
| `GitHubMergeResult` | `ChangeRequestState + webUrl` |
| `GitHubResolveThreadInput` | `ReviewThread id + Stage 3 operation context` |
| `GitHubResolveThreadResult` | `ReviewThreadState` |
| `githubResolveUrlInputSchema` | `Stage 3 provider operation schema` |
| `githubPrChecksFixPromptInputSchema` | `Stage 3 provider operation schema` |
| `githubPullRequestTemplateInputSchema` | `Stage 3 provider operation schema` |
| `githubListPullRequestsInputSchema` | `Stage 3 provider operation schema` |
| `githubViewPullRequestInputSchema` | `Stage 3 provider operation schema` |
| `githubCreatePullRequestInputSchema` | `Stage 3 provider operation schema` |
| `githubAddPullRequestCommentInputSchema` | `Stage 3 provider operation schema` |
| `githubCreateWorkspaceFromPullRequestInputSchema` | `Stage 3 provider operation schema` |
| `GitHubRepositoryOwner` | `RepositoryIdentity.namespace + extensions.github` |
| `GitHubRepositoryOwnerKind` | `extensions.github.ownerKind` |
| `GitHubRepositoryOwnersResult` | `RepositoryIdentity.namespace discovery result` |
| `GitHubListRepositoriesInput` | `Stage 3 discovery input` |
| `GitHubRepository` | `RepositoryIdentity + extensions.github` |
| `GitHubListRepositoriesResult` | `RepositoryIdentity[]` |
| `githubMergeInputSchema` | `Stage 3 provider operation schema` |
| `githubResolveThreadInputSchema` | `Stage 3 provider operation schema` |
| `GitHubPrContextInput` | `RepositoryIdentity + change request id` |
| `GitHubChecksInput` | `RepositoryIdentity + change request id` |
| `GitHubReviewThreadsInput` | `RepositoryIdentity + change request id` |
| `GitHubCheckItem` | `CheckRun` |
| `GitHubChecksSnapshot` | `CheckSummary` |
| `GitHubReviewThreadComment` | `ReviewComment` |
| `GitHubReviewThread` | `ReviewThread` |
| `GitHubReviewThreadsResult` | `ReviewThread[]` |
| `GitHubFailureLogInput` | `CheckLogRef + Stage 3 operation context` |
| `GitHubFailureLogResult` | `Stage 3 checks.failureLog payload` |
| `githubPrContextInputSchema` | `Stage 3 provider operation schema` |
| `githubFailureLogInputSchema` | `Stage 3 provider operation schema` |
| `PullRequestCreateInput` | `Retained LocalGitBackend create input` |
| `PullRequestRecord` | `ChangeRequest + local persistence fields` |
| `PullRequestPreflight` | `ChangeRequest + MergeRequirement[] + local git state` |
| `PullRequestCreateResult` | `ChangeRequest + SourceControlErrorDetails` |
| `pullRequestCreateInputSchema` | `Retained LocalGitBackend input schema` |
