import type {
  ChangeRequest,
  WorkItem,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it, vi } from "vitest";
import { resolveShepherdTarget } from "./resolve-shepherd-target";

const repository = {
  displayPath: "group/widgets",
  host: "gitlab.example.com",
  name: "widgets",
  namespace: ["group"],
  providerId: "gitlab",
  remoteId: "42",
  webUrl: "https://gitlab.example.com/group/widgets",
} as const;

const changeRequest = {
  additions: null,
  allowedMergeMethods: ["squash"],
  author: null,
  body: "",
  changedFiles: null,
  commitCount: null,
  createdAt: null,
  defaultMergeMethod: "squash",
  deletions: null,
  draft: false,
  extensions: {},
  id: "17",
  mergeRequirements: [],
  mergedAt: null,
  number: 17,
  repository,
  reviewDecision: "none",
  source: { name: "feature", oid: null, repository },
  state: "open",
  target: { name: "main", oid: null, repository },
  title: "Feature",
  updatedAt: null,
  viewerCanMerge: true,
  webUrl: "https://gitlab.example.com/group/widgets/-/merge_requests/17",
} satisfies ChangeRequest;

describe("resolveShepherdTarget", () => {
  it("resolves a non-Forge change-request URL through source control", async () => {
    const resolveLink = vi.fn().mockResolvedValue(changeRequest);
    const result = await resolveShepherdTarget({
      api: { sourceControl: { resolveLink } } as never,
      projectPath: "/workspace/widgets",
      url: "https://gitlab.example.com/group/widgets/-/merge_requests/17",
    });

    expect(resolveLink).toHaveBeenCalledWith(
      "/workspace/widgets",
      "https://gitlab.example.com/group/widgets/-/merge_requests/17",
    );
    expect(result).toEqual({ owner: "group", prNumber: 17, repo: "widgets" });
  });

  it("does not mistake a work-item URL for a shepherd target", async () => {
    const resolveLink = vi.fn().mockResolvedValue({
      assignees: [],
      author: null,
      body: "",
      closedAt: null,
      createdAt: null,
      extensions: {},
      id: "9",
      kind: "issue",
      labels: [],
      number: 9,
      repository,
      state: "open",
      title: "Issue",
      updatedAt: null,
      webUrl: "https://gitlab.example.com/group/widgets/-/issues/9",
    } satisfies WorkItem);
    await expect(
      resolveShepherdTarget({
        api: { sourceControl: { resolveLink } } as never,
        projectPath: "/workspace/widgets",
        url: "https://gitlab.example.com/group/widgets/-/issues/9",
      }),
    ).resolves.toBeNull();
  });
});
