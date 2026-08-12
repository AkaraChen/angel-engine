import { describe, expect, it } from "vitest";

import { createGhRunner, mapGhFailure } from "./gh-cli";

describe("createGhRunner", () => {
  it("strips ANSI from stdout and stderr", async () => {
    const runGh = createGhRunner(async () => ({
      stderr: "\u001B[33mwarning\u001B[0m",
      stdout: '\u001B[1;37m{"ok":true}\u001B[0m',
    }));

    await expect(runGh(["repo", "view"])).resolves.toEqual({
      stderr: "warning",
      stdout: '{"ok":true}',
    });
  });

  it("strips ANSI from failures before error mapping", async () => {
    const runGh = createGhRunner(async () => {
      throw Object.assign(new Error("command failed"), {
        stderr: "\u001B[31mnot logged into GitHub\u001B[0m",
        stdout: "\u001B[32mignored\u001B[0m",
      });
    });

    const cause = await runGh(["auth", "status"]).catch(
      (error: unknown) => error,
    );

    expect(cause).toMatchObject({
      stderr: "not logged into GitHub",
      stdout: "ignored",
    });
    expect(mapGhFailure(cause)).toMatchObject({
      code: "source-control/unauthenticated",
      sourceControl: { providerId: "github" },
    });
  });
});
