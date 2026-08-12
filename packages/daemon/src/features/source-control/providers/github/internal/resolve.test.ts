import { Cause, Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";

import {
  formatGitHubContextText,
  parseGitHubUrl,
  resolveGitHubUrl,
  truncateBody,
} from "./resolve";

async function expectDaemonFailure(
  effect: Effect.Effect<unknown, { code: string }>,
  code: string,
) {
  const exit = await Effect.runPromiseExit(effect);
  expect(Exit.isFailure(exit)).toBe(true);
  if (!Exit.isFailure(exit)) return;
  const failure = Cause.failureOption(exit.cause);
  expect(failure._tag).toBe("Some");
  if (failure._tag === "Some") {
    expect(failure.value).toMatchObject({ code });
  }
}

describe("parseGitHubUrl", () => {
  it("parses issue and pull request URLs", () => {
    expect(parseGitHubUrl("https://github.com/acme/widgets/issues/12")).toEqual(
      {
        kind: "issue",
        number: 12,
        owner: "acme",
        repo: "widgets",
        url: "https://github.com/acme/widgets/issues/12",
      },
    );
    expect(
      parseGitHubUrl("https://www.github.com/acme/widgets/pull/99?foo=1"),
    ).toEqual({
      kind: "pullRequest",
      number: 99,
      owner: "acme",
      repo: "widgets",
      url: "https://github.com/acme/widgets/pull/99",
    });
  });

  it("rejects unsupported hosts and shapes", () => {
    expect(
      parseGitHubUrl("https://gitlab.com/acme/widgets/issues/1"),
    ).toBeNull();
    expect(parseGitHubUrl("https://github.com/acme/widgets")).toBeNull();
    expect(parseGitHubUrl("not a url")).toBeNull();
  });
});

describe("truncateBody", () => {
  it("marks overflow", () => {
    const long = "a".repeat(20);
    const result = truncateBody(long, 10);
    expect(result.truncated).toBe(true);
    expect(result.body).toContain("[Truncated:");
    expect(result.body.startsWith("aaaaaaaaaa")).toBe(true);
  });
});

describe("formatGitHubContextText", () => {
  it("formats issue context", () => {
    const text = formatGitHubContextText({
      author: "alice",
      body: "Please fix this",
      kind: "issue",
      number: 7,
      owner: "acme",
      repo: "widgets",
      state: "OPEN",
      title: "Broken button",
      url: "https://github.com/acme/widgets/issues/7",
    });
    expect(text).toContain("GitHub Issue #7 — Broken button");
    expect(text).toContain("Author: @alice");
    expect(text).toContain("Please fix this");
  });
});

describe("resolveGitHubUrl", () => {
  it("resolves an issue through a fake gh runner", async () => {
    const result = await Effect.runPromise(
      resolveGitHubUrl(
        { url: "https://github.com/acme/widgets/issues/3" },
        {
          runGh: async () => ({
            stderr: "",
            stdout: JSON.stringify({
              author: { login: "bob" },
              body: "body text",
              number: 3,
              state: "OPEN",
              title: "Hello",
              url: "https://github.com/acme/widgets/issues/3",
            }),
          }),
          whichGh: async () => "/usr/local/bin/gh",
        },
      ),
    );

    expect(result.kind).toBe("issue");
    expect(result.number).toBe(3);
    expect(result.title).toBe("Hello");
    expect(result.author).toBe("bob");
    expect(result.contextText).toContain("body text");
  });

  it("resolves a pull request through a fake gh runner", async () => {
    const result = await Effect.runPromise(
      resolveGitHubUrl(
        { url: "https://github.com/acme/widgets/pull/4" },
        {
          runGh: async () => ({
            stderr: "",
            stdout: JSON.stringify({
              author: null,
              baseRefName: "main",
              body: "pull request body",
              headRefName: "fix/widget",
              isDraft: true,
              number: 4,
              state: "OPEN",
              title: "Fix widget",
              url: "https://github.com/acme/widgets/pull/4",
            }),
          }),
          whichGh: async () => "/usr/local/bin/gh",
        },
      ),
    );

    expect(result).toMatchObject({
      author: null,
      baseRefName: "main",
      headRefName: "fix/widget",
      isDraft: true,
      kind: "pullRequest",
      number: 4,
      title: "Fix widget",
    });
    expect(result.contextText).toContain("Branches: main ← fix/widget");
    expect(result.contextText).toContain("Draft: yes");
  });

  it("accepts a null GitHub body as empty context", async () => {
    const result = await Effect.runPromise(
      resolveGitHubUrl(
        { url: "https://github.com/acme/widgets/issues/3" },
        {
          runGh: async () => ({
            stderr: "",
            stdout: JSON.stringify({
              author: { login: "bob" },
              body: null,
              number: 3,
              state: "OPEN",
              title: "Empty body",
              url: "https://github.com/acme/widgets/issues/3",
            }),
          }),
          whichGh: async () => "/usr/local/bin/gh",
        },
      ),
    );

    expect(result.body).toBe("");
    expect(result.contextText).toContain("Body:\n(empty)");
  });

  it("rejects malformed GitHub CLI payloads", async () => {
    await expectDaemonFailure(
      resolveGitHubUrl(
        { url: "https://github.com/acme/widgets/issues/3" },
        {
          runGh: async () => ({
            stderr: "",
            stdout: JSON.stringify({
              author: { login: "bob" },
              body: "body text",
              number: 3,
              state: "OPEN",
              url: "https://github.com/acme/widgets/issues/3",
            }),
          }),
          whichGh: async () => "/usr/local/bin/gh",
        },
      ),
      "source-control/fetch-failed",
    );
  });

  it("rejects a payload for a different GitHub item", async () => {
    await expectDaemonFailure(
      resolveGitHubUrl(
        { url: "https://github.com/acme/widgets/issues/3" },
        {
          runGh: async () => ({
            stderr: "",
            stdout: JSON.stringify({
              author: { login: "bob" },
              body: "body text",
              number: 5,
              state: "OPEN",
              title: "Wrong issue",
              url: "https://github.com/acme/widgets/issues/5",
            }),
          }),
          whichGh: async () => "/usr/local/bin/gh",
        },
      ),
      "source-control/fetch-failed",
    );
  });

  it("fails when gh is missing", async () => {
    await expectDaemonFailure(
      resolveGitHubUrl(
        { url: "https://github.com/acme/widgets/issues/3" },
        {
          whichGh: async () => null,
        },
      ),
      "source-control/cli-missing",
    );
  });

  it("fails for unsupported URLs", async () => {
    await expectDaemonFailure(
      resolveGitHubUrl(
        { url: "https://example.com/issue/1" },
        { whichGh: async () => "/bin/gh" },
      ),
      "source-control/url-unsupported",
    );
  });

  it("maps auth failures", async () => {
    await expectDaemonFailure(
      resolveGitHubUrl(
        { url: "https://github.com/acme/widgets/pull/1" },
        {
          runGh: async () => {
            const error = new Error("gh failed") as Error & {
              stderr: string;
            };
            error.stderr =
              "To get started with GitHub CLI, please run: gh auth login";
            throw error;
          },
          whichGh: async () => "/bin/gh",
        },
      ),
      "source-control/unauthenticated",
    );
  });
});
