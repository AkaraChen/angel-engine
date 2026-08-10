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
          checkRunId: "1",
          conclusion: "FAILURE",
          detailsUrl: "https://example.test/run",
          isPending: false,
          isRequired: true,
          name: "build",
          status: "COMPLETED",
          workflowName: "ubuntu",
          workflowRunId: "9",
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
          log: { lines: ["error: boom", "  at main"], truncated: true },
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
