import { describe, expect, it } from "vitest";

import { buildShepherdPrompt } from "./prompt";

describe("buildShepherdPrompt", () => {
  it("includes the source card header and failure context", () => {
    const prompt = buildShepherdPrompt({
      round: 3,
      maxRounds: 10,
      failedRequired: [
        {
          attempt: 1,
          id: "1",
          group: {
            id: "group-1",
            kind: "workflow-run",
            name: "ubuntu",
            stage: null,
            parentGroupId: null,
            attempt: 1,
            detailsUrl: null,
          },
          conclusion: "failure",
          detailsUrl: "https://example.test/run",
          requiredness: "required",
          blocking: true,
          retryOf: null,
          allowFailure: false,
          manual: false,
          startedAt: null,
          completedAt: null,
          logRef: { kind: "workflow-run", runId: "9", jobId: null },
          name: "build",
          status: "completed",
        },
      ],
      newComments: [
        {
          author: "reviewer",
          body: "Please rename this.",
          path: "src/a.ts",
          line: 12,
        },
      ],
      failureLogs: [
        {
          checkName: "build",
          log: { text: "error: boom\n  at main", truncated: true },
        },
      ],
    });

    expect(prompt).toContain(
      "🐑 Shepherd round 3/10 · 触发：`build (ubuntu)` failed · 1 条新 review 评论",
    );
    expect(prompt).toContain("## Failure log: build");
    expect(prompt).toContain("error: boom");
    expect(prompt).toContain("Please rename this.");
  });
});
