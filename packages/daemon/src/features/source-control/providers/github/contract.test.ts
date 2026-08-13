import type { ProbeContext } from "@angel-engine/daemon-api/source-control";

import { runProviderContractSuite } from "../../contract/provider-contract";
import { createGitHubPlugin } from "./plugin";

const repository = {
  displayPath: "acme/widgets",
  host: "github.com",
  name: "widgets",
  namespace: ["acme"],
  providerId: "github",
  remoteId: null,
  webUrl: "https://github.com/acme/widgets",
} as const;

const probe: ProbeContext = {
  defaultRemote: "origin",
  explicitProviderId: null,
  explicitRemote: null,
  hostMappings: {},
  projectPath: "/contract",
  remotes: [
    {
      fetchUrl: "https://github.com/acme/widgets.git",
      name: "origin",
      pushUrl: null,
      url: "https://github.com/acme/widgets.git",
    },
  ],
  upstreamRemote: null,
};

const actor = { login: "ada" };
const pullRequest = {
  additions: 1,
  author: actor,
  baseRefName: "main",
  body: "Body",
  changedFiles: 1,
  commits: [{ oid: "abc" }],
  createdAt: "2026-08-13T00:00:00Z",
  deletions: 0,
  headRefName: "feature",
  headRefOid: "abc",
  headRepository: { nameWithOwner: "acme/widgets", url: repository.webUrl },
  isDraft: false,
  mergeable: "MERGEABLE",
  mergeStateStatus: "CLEAN",
  mergedAt: null,
  number: 7,
  reviewDecision: "APPROVED",
  state: "OPEN",
  title: "Ship widgets",
  updatedAt: "2026-08-13T01:00:00Z",
  url: `${repository.webUrl}/pull/7`,
};
const issue = {
  assignees: [],
  author: actor,
  body: "Issue body",
  closedAt: null,
  createdAt: "2026-08-13T00:00:00Z",
  labels: [],
  number: 3,
  state: "OPEN",
  title: "Widget issue",
  updatedAt: "2026-08-13T01:00:00Z",
  url: `${repository.webUrl}/issues/3`,
};
const thread = {
  comments: {
    nodes: [
      {
        author: actor,
        body: "Rename this",
        createdAt: "2026-08-13T00:00:00Z",
        id: "comment-1",
        line: 10,
        path: "src/a.ts",
        url: `${repository.webUrl}/pull/7#discussion_r1`,
      },
    ],
  },
  id: "thread-1",
  isOutdated: false,
  isResolved: false,
  line: 10,
  path: "src/a.ts",
};
const failedCheck = {
  __typename: "CheckRun",
  checkSuite: {
    workflowRun: { databaseId: 9001, workflow: { name: "CI" } },
  },
  completedAt: "2026-08-13T00:01:00Z",
  conclusion: "FAILURE",
  databaseId: 111,
  detailsUrl: `${repository.webUrl}/actions/runs/9001`,
  isRequired: true,
  name: "test",
  startedAt: "2026-08-13T00:00:00Z",
  status: "COMPLETED",
};
const contractRunGh = async (args: string[]) => {
  let payload: unknown = {};
  if (args[0] === "api" && args[1] === "user") payload = { login: "acme" };
  else if (args[0] === "api" && args[1] === "user/orgs") payload = [];
  else if (args[0] === "repo" && args[1] === "list") {
    payload = [
      {
        defaultBranchRef: { name: "main" },
        description: null,
        isArchived: false,
        isFork: false,
        isPrivate: false,
        name: "widgets",
        nameWithOwner: "acme/widgets",
        owner: actor,
        pushedAt: "2026-08-13T00:00:00Z",
        url: repository.webUrl,
      },
    ];
  } else if (args[0] === "repo" && args[1] === "view") {
    payload = args.includes("defaultBranchRef")
      ? { defaultBranchRef: { name: "main" } }
      : {
          mergeCommitAllowed: true,
          nameWithOwner: "acme/widgets",
          rebaseMergeAllowed: true,
          squashMergeAllowed: true,
          viewerPermission: "WRITE",
        };
  } else if (args[0] === "pr" && args[1] === "create")
    payload = { number: 7, url: pullRequest.url };
  else if (args[0] === "pr" && args[1] === "list") payload = [pullRequest];
  else if (
    args[0] === "pr" &&
    args[1] === "view" &&
    args.includes("comments")
  ) {
    payload = {
      comments: [
        {
          author: actor,
          body: "Looks good",
          createdAt: "2026-08-13T01:00:00Z",
          id: "comment-2",
          url: `${pullRequest.url}#issuecomment-2`,
        },
      ],
    };
  } else if (args[0] === "pr" && args[1] === "view") payload = pullRequest;
  else if (args[0] === "issue" && args[1] === "list") payload = [issue];
  else if (args[0] === "issue" && args[1] === "view") payload = issue;
  else if (args[0] === "run") return { stderr: "", stdout: "failure log" };
  else if (args[0] === "api" && args[1] === "graphql") {
    const query = args.find((arg) => arg.startsWith("query=")) ?? "";
    if (query.includes("resolveReviewThread")) {
      payload = {
        data: {
          resolveReviewThread: { thread: { ...thread, isResolved: true } },
        },
      };
    } else if (query.includes("reviewThreads")) {
      payload = {
        data: {
          repository: { pullRequest: { reviewThreads: { nodes: [thread] } } },
        },
      };
    } else if (query.includes("statusCheckRollup")) {
      payload = {
        data: {
          repository: {
            pullRequest: {
              commits: {
                nodes: [
                  {
                    commit: {
                      oid: "abc",
                      statusCheckRollup: { contexts: { nodes: [failedCheck] } },
                    },
                  },
                ],
              },
            },
          },
        },
      };
    } else {
      payload = { data: { repository: { pullRequest: { id: "PR_7" } } } };
    }
  }
  return { stderr: "", stdout: JSON.stringify(payload) };
};
const contractRunGit = async () => ({ stderr: "", stdout: "" });
const operationContext = () => ({
  deadline: Date.now() + 10_000,
  signal: new AbortController().signal,
});
const numbered = { id: "7", repository };
const listed = { limit: 10, query: null, repository };

runProviderContractSuite(
  () =>
    createGitHubPlugin({
      findGh: async () => "/usr/bin/gh",
      runGh: contractRunGh,
      runGit: contractRunGit,
    }),
  {
    auth: {
      expectedAuthentication: "authenticated",
      run: (plugin) =>
        plugin.auth.status(
          { projectPath: "/contract", remote: probe.remotes[0] },
          operationContext(),
        ),
    },
    operations: [
      {
        capability: "discovery.listNamespaces",
        run: (plugin) =>
          plugin.discovery.listNamespaces!(
            { limit: 10, query: null },
            operationContext(),
          ),
      },
      {
        capability: "discovery.listRepositories",
        run: (plugin) =>
          plugin.discovery.listRepositories!(
            { limit: 10, namespace: ["acme"], query: null },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.get",
        run: (plugin) =>
          plugin.changeRequests!.get!(numbered, operationContext()),
      },
      {
        capability: "changeRequests.getByUrl",
        run: (plugin) =>
          plugin.changeRequests!.getByUrl!(
            { url: pullRequest.url },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.list",
        run: (plugin) =>
          plugin.changeRequests!.list!(listed, operationContext()),
      },
      {
        capability: "changeRequests.status",
        run: (plugin) =>
          plugin.changeRequests!.status!(numbered, operationContext()),
      },
      {
        capability: "changeRequests.resolveHead",
        run: (plugin) =>
          plugin.changeRequests!.resolveHead!(numbered, operationContext()),
      },
      {
        capability: "changeRequests.create",
        run: (plugin) =>
          plugin.changeRequests!.create!(
            {
              body: "Body",
              draft: false,
              repository,
              sourceBranch: "feature",
              targetBranch: "main",
              title: "Ship widgets",
            },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.comment",
        run: (plugin) =>
          plugin.changeRequests!.comment!(
            { body: "Looks good", ...numbered },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.merge",
        run: (plugin) =>
          plugin.changeRequests!.merge!(
            { ...numbered, method: "merge" },
            operationContext(),
          ),
      },
      {
        capability: "changeRequests.preflight",
        run: (plugin) =>
          plugin.changeRequests!.preflight!(
            { repository, sourceBranch: "feature", targetBranch: null },
            operationContext(),
          ),
      },
      {
        capability: "branches.publish",
        run: (plugin) =>
          plugin.git.publishBranch!(
            {
              forceWithLease: false,
              localBranch: "feature",
              projectPath: "/contract",
              remoteName: "origin",
              repository,
            },
            operationContext(),
          ),
      },
      {
        capability: "checks.list",
        run: (plugin) => plugin.checks!.list!(numbered, operationContext()),
      },
      {
        capability: "checks.snapshot",
        run: (plugin) => plugin.checks!.snapshot!(numbered, operationContext()),
      },
      {
        capability: "checks.failureLog",
        run: (plugin) =>
          plugin.checks!.failureLog!(
            {
              logRef: { jobId: "111", kind: "workflow-run", runId: "9001" },
              repository,
              tailLines: 40,
            },
            operationContext(),
          ),
      },
      {
        capability: "checks.fixPrompt",
        run: (plugin) =>
          plugin.checks!.fixPrompt!(numbered, operationContext()),
      },
      {
        capability: "reviewThreads.list",
        run: (plugin) =>
          plugin.reviews!.listThreads!(numbered, operationContext()),
      },
      {
        capability: "reviewThreads.resolve",
        run: (plugin) =>
          plugin.reviews!.resolveThread!(
            { repository, threadId: "thread-1" },
            operationContext(),
          ),
      },
      {
        capability: "workItems.get",
        run: (plugin) =>
          plugin.workItems!.get!({ id: "3", repository }, operationContext()),
      },
      {
        capability: "workItems.getByUrl",
        run: (plugin) =>
          plugin.workItems!.getByUrl!({ url: issue.url }, operationContext()),
      },
      {
        capability: "workItems.list",
        run: (plugin) => plugin.workItems!.list!(listed, operationContext()),
      },
      {
        capability: "provider.clone",
        run: (plugin) =>
          plugin.git.clone!(
            { repository, targetPath: "/contract/widgets" },
            operationContext(),
          ),
      },
    ],
    probe,
    repository: {
      expected: repository,
      urls: [
        "https://github.com/acme/widgets.git",
        "ssh://git@github.com/acme/widgets.git",
        "git@github.com:acme/widgets.git",
      ],
    },
    selfHosted: {
      expected: {
        ...repository,
        host: "code.acme.internal",
        webUrl: "https://code.acme.internal/acme/widgets",
      },
      probe: {
        ...probe,
        hostMappings: { "code.acme.internal": "github" },
        remotes: [
          {
            fetchUrl: "git@code.acme.internal:acme/widgets.git",
            name: "origin",
            pushUrl: null,
            url: "git@code.acme.internal:acme/widgets.git",
          },
        ],
      },
      url: "git@code.acme.internal:acme/widgets.git",
    },
  },
);
