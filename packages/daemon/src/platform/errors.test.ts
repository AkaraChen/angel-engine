import { describe, expect, it } from "vitest";

import { DaemonError, daemonErrorPayload } from "./errors";

describe("source-control daemon errors", () => {
  it("uses provider-neutral codes and preserves provider diagnostics", () => {
    const error = DaemonError.sourceControlFetchFailed(
      "gitlab",
      new Error("GraphQL rate limit exceeded"),
    );

    expect(daemonErrorPayload(error)).toEqual({
      code: "source-control/fetch-failed",
      error: "GraphQL rate limit exceeded",
      sourceControl: {
        providerId: "gitlab",
        operation: "fetch",
        retryable: true,
        providerMessage: "GraphQL rate limit exceeded",
      },
    });
  });

  it("keeps shared default messages provider-neutral", () => {
    const errors = [
      DaemonError.sourceControlCliMissing("gitlab"),
      DaemonError.sourceControlUnauthenticated("gitlab"),
      DaemonError.sourceControlUrlUnsupported("gitlab"),
      DaemonError.sourceControlItemNotFound("gitlab"),
      DaemonError.sourceControlFetchFailed("gitlab", null),
      DaemonError.sourceControlNetworkUnavailable("gitlab"),
      DaemonError.linkUnsupported(),
    ];

    for (const error of errors) {
      expect(error.message).not.toMatch(/GitHub|github\.com|\bgh\b/);
    }
  });
});
