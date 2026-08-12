import type {
  ChangeRequestHeadResult,
  RepositoryIdentity,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import { changeRequestFetchTarget } from "./workspace";

const repository = {
  providerId: "github",
  host: "github.com",
  namespace: ["acme"],
  name: "widgets",
  remoteId: null,
  displayPath: "acme/widgets",
  webUrl: "https://github.com/acme/widgets",
} as const;

function resolved(
  sourceRepository: RepositoryIdentity = repository,
): ChangeRequestHeadResult {
  return {
    changeRequest: {
      id: "7",
      number: 7,
      repository,
      title: "Improve widgets",
      body: "",
      author: null,
      state: "open",
      draft: false,
      source: { name: "feature", oid: null, repository: sourceRepository },
      target: { name: "main", oid: null, repository },
      webUrl: "https://github.com/acme/widgets/pull/7",
      createdAt: null,
      updatedAt: null,
      mergedAt: null,
      additions: null,
      deletions: null,
      changedFiles: null,
      commitCount: null,
      reviewDecision: "none",
      mergeRequirements: [],
      allowedMergeMethods: [],
      defaultMergeMethod: null,
      viewerCanMerge: null,
    },
    remoteUrl: "https://github.com/fork/widgets",
    ref: "feature",
  };
}

describe("changeRequestFetchTarget", () => {
  it("preserves the pull ref and configured origin for same-repository PRs", () => {
    expect(changeRequestFetchTarget(resolved())).toEqual({
      ref: "pull/7/head",
      remote: "origin",
    });
  });

  it("fetches a fork PR from its head repository and branch", () => {
    const fork = {
      ...repository,
      displayPath: "fork/widgets",
      namespace: ["fork"],
    };
    expect(changeRequestFetchTarget(resolved(fork))).toEqual({
      ref: "feature",
      remote: "https://github.com/fork/widgets",
    });
  });
});
