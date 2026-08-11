import { describe, expect, it } from "vitest";

import { DaemonError, daemonErrorPayload } from "./errors";

describe("source-control daemon errors", () => {
  it("uses provider-neutral codes and preserves provider diagnostics", () => {
    const error = DaemonError.sourceControlFetchFailed(
      new Error("GraphQL rate limit exceeded"),
    );

    expect(daemonErrorPayload(error)).toEqual({
      code: "source-control/fetch-failed",
      error: "GraphQL rate limit exceeded",
      sourceControl: {
        providerId: "github",
        operation: "fetch",
        retryable: true,
        providerMessage: "GraphQL rate limit exceeded",
      },
    });
  });
});
