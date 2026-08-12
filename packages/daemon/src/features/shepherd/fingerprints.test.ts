import type {
  CheckRun,
  RepositoryIdentity,
} from "@angel-engine/daemon-api/source-control";
import { describe, expect, it } from "vitest";

import { checkFingerprint } from "./fingerprints";

const repository: RepositoryIdentity = {
  providerId: "github",
  host: "github.com",
  namespace: ["acme"],
  name: "app",
  remoteId: null,
  displayPath: "acme/app",
  webUrl: null,
};

function check(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: "run-1",
    group: {
      id: "group-1",
      kind: "workflow-run",
      name: "ci",
      stage: "test",
      parentGroupId: null,
      attempt: 1,
      detailsUrl: null,
    },
    name: "build",
    status: "completed",
    conclusion: "failure",
    requiredness: "required",
    blocking: true,
    attempt: 1,
    retryOf: null,
    allowFailure: false,
    manual: false,
    startedAt: null,
    completedAt: null,
    detailsUrl: null,
    logRef: null,
    ...overrides,
  };
}

describe("checkFingerprint", () => {
  it("cannot collide when logical segments contain delimiters", () => {
    const first = check({
      group: { ...check().group!, name: "a:b", stage: "c" },
      name: "d",
    });
    const second = check({
      group: { ...check().group!, name: "a", stage: "b:c" },
      name: "d",
    });
    expect(checkFingerprint(first, repository)).not.toBe(
      checkFingerprint(second, repository),
    );
  });

  it("is stable across provider attempts and runtime outcomes", () => {
    const retry = check({
      id: "run-2",
      attempt: 2,
      retryOf: "run-1",
      conclusion: "success",
      status: "completed",
      detailsUrl: "https://example.test/attempt/2",
      group: { ...check().group!, id: "group-2", attempt: 2 },
    });
    expect(checkFingerprint(check(), repository)).toBe(
      checkFingerprint(retry, repository),
    );
  });

  it("uses an explicit ungrouped identity without group metadata", () => {
    const fingerprint = checkFingerprint(check({ group: null }), repository);
    expect(fingerprint).toContain("9:ungrouped");
    expect(fingerprint).toBe(
      checkFingerprint(
        check({ id: "other", group: null, attempt: 7 }),
        repository,
      ),
    );
  });
});
