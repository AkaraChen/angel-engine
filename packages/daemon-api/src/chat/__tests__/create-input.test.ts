import type { ChatRunStartInput } from "..";
import { chatCreateInputSchema } from "..";
import { type as arkType } from "arktype";
import { describe, expect, it } from "vitest";

/**
 * Prewarm is a chat-creation optimization. Keeping it out of the run contract
 * is what stops stream semantics from creeping back into runs, so this fails to
 * compile the moment `ChatRunStartInput` grows a `prewarmId`.
 */
type RunStartHasNoPrewarm = "prewarmId" extends keyof ChatRunStartInput
  ? never
  : true;

describe("chat create input", () => {
  it("carries prewarmId so create can claim a prewarmed session", () => {
    const input = chatCreateInputSchema({
      prewarmId: "prewarm-1",
      projectId: "project-1",
      runtime: "claude",
    });

    expect(input).not.toBeInstanceOf(arkType.errors);
    expect(input).toMatchObject({ prewarmId: "prewarm-1" });
  });

  it("rejects an empty prewarmId instead of silently dropping it", () => {
    expect(chatCreateInputSchema({ prewarmId: "" })).toBeInstanceOf(
      arkType.errors,
    );
  });

  it("carries a pinned cwd and a worktree location so create owns placement", () => {
    // Desktop drafts can pin an existing worktree cwd; without these fields the
    // create route would silently place the chat at the project root instead.
    const input = chatCreateInputSchema({
      creationLocation: "worktree",
      cwd: "/repo/.worktrees/feature",
      projectId: "project-1",
    });

    expect(input).not.toBeInstanceOf(arkType.errors);
    expect(input).toMatchObject({
      creationLocation: "worktree",
      cwd: "/repo/.worktrees/feature",
    });
  });

  it("rejects an empty cwd instead of silently dropping it", () => {
    expect(chatCreateInputSchema({ cwd: "" })).toBeInstanceOf(arkType.errors);
  });

  it("carries remoteThreadId so import can bind a remote session", () => {
    const input = chatCreateInputSchema({
      remoteThreadId: "remote-1",
      runtime: "codex",
    });
    expect(input).not.toBeInstanceOf(arkType.errors);
    expect(input).toMatchObject({ remoteThreadId: "remote-1" });
  });

  it("carries source metadata and a pull request head ref", () => {
    const input = chatCreateInputSchema({
      sourceLink: {
        kind: "pullRequest",
        provider: "github",
        url: "https://github.com/acme/widgets/pull/42",
      },
      worktreeRef: {
        remoteRef: "pull/42/head",
        type: "existingBranch",
        value: "fix/widgets",
      },
    });

    expect(input).not.toBeInstanceOf(arkType.errors);
    expect(input).toMatchObject({
      sourceLink: { kind: "pullRequest", provider: "github" },
      worktreeRef: { type: "existingBranch", value: "fix/widgets" },
    });
  });

  it("carries provider-neutral change request source metadata", () => {
    const input = chatCreateInputSchema({
      sourceLink: {
        kind: "changeRequest",
        provider: "gitlab",
        url: "https://gitlab.example/acme/widgets/-/merge_requests/42",
      },
      worktreeRef: {
        type: "existingBranch",
        value: "fix/widgets",
      },
    });

    expect(input).not.toBeInstanceOf(arkType.errors);
    expect(input).toMatchObject({
      sourceLink: { kind: "changeRequest", provider: "gitlab" },
      worktreeRef: { type: "existingBranch", value: "fix/widgets" },
    });
  });

  it("rejects an empty remoteThreadId instead of silently dropping it", () => {
    expect(chatCreateInputSchema({ remoteThreadId: "" })).toBeInstanceOf(
      arkType.errors,
    );
  });

  it("keeps prewarm off run start input", () => {
    const runStartHasNoPrewarm: RunStartHasNoPrewarm = true;

    expect(runStartHasNoPrewarm).toBe(true);
  });
});
