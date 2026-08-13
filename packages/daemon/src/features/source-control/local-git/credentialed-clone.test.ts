import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { credentialedClone } from "./credentialed-clone";

const context = () => ({
  deadline: Date.now() + 10_000,
  signal: new AbortController().signal,
});

describe("credentialed clone", () => {
  it("uses an ephemeral askpass shim without putting the token in URL or arguments", async () => {
    const token = "gitlab-secret-value";
    const runGit = vi.fn(async (_cwd, args, options) => {
      expect(args.join(" ")).not.toContain(token);
      expect(args).toContain("https://gitlab.invalid/acme/widgets.git");
      expect(options?.env?.GIT_ASKPASS).toBeTruthy();
      expect(
        await readFile(options?.env?.GIT_ASKPASS ?? "", "utf8"),
      ).not.toContain(token);
      return { stderr: "", stdout: "" };
    });

    await credentialedClone({
      context: context(),
      getToken: async () => token,
      remoteUrl: "https://gitlab.invalid/acme/widgets.git",
      runGit,
      targetPath: "/managed/widgets",
    });

    expect(runGit).toHaveBeenCalledOnce();
  });

  it("delegates SSH remotes directly to Git", async () => {
    const getToken = vi.fn(async () => "unused");
    const runGit = vi.fn(async () => ({ stderr: "", stdout: "" }));
    await credentialedClone({
      context: context(),
      getToken,
      remoteUrl: "git@gitlab.example.com:acme/widgets.git",
      runGit,
      targetPath: "/managed/widgets",
    });
    expect(getToken).not.toHaveBeenCalled();
    expect(runGit).toHaveBeenCalledWith(
      "/managed",
      [
        "clone",
        "--progress",
        "git@gitlab.example.com:acme/widgets.git",
        "/managed/widgets",
      ],
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps public HTTPS cloning available without configured credentials", async () => {
    const runGit = vi.fn(async () => ({ stderr: "", stdout: "" }));
    await credentialedClone({
      context: context(),
      remoteUrl: "https://gitlab.invalid/acme/public-widgets.git",
      runGit,
      targetPath: "/managed/public-widgets",
    });
    expect(runGit).toHaveBeenCalledOnce();
  });
});
