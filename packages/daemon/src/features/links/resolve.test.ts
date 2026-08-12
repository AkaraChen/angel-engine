import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import { createGitHubPlugin } from "../source-control/providers/github/plugin";
import { SourceControlRegistry } from "../source-control/registry/registry";
import { resolveTaskLink } from "./resolve";

describe("resolveTaskLink", () => {
  it("resolves provider links through registry capabilities", async () => {
    const runGh = vi.fn(async () => ({
      stderr: "",
      stdout: JSON.stringify({
        assignees: [],
        author: { login: "alice" },
        body: "Fix the widget.",
        closedAt: null,
        createdAt: "2026-08-12T00:00:00Z",
        labels: [{ name: "bug" }],
        number: 42,
        state: "OPEN",
        title: "Broken widget",
        updatedAt: "2026-08-12T01:00:00Z",
        url: "https://github.com/acme/widgets/issues/42",
      }),
    }));
    const registry = new SourceControlRegistry();
    registry.register(
      createGitHubPlugin({ findGh: async () => "/usr/bin/gh", runGh }),
    );

    await expect(
      Effect.runPromise(
        resolveTaskLink(
          { url: "https://github.com/acme/widgets/issues/42" },
          registry,
        ),
      ),
    ).resolves.toMatchObject({
      kind: "issue",
      number: 42,
      provider: "github",
      title: "Broken widget",
    });
    expect(runGh).toHaveBeenCalledWith([
      "issue",
      "view",
      "https://github.com/acme/widgets/issues/42",
      "--json",
      expect.any(String),
    ]);
  });
});
