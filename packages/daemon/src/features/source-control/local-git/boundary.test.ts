import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")
      ? [entryPath]
      : [];
  });
}

describe("LocalGitBackend boundary", () => {
  it("keeps direct git process execution in the explicit migration allowlist", () => {
    const sourceRoot = path.resolve(import.meta.dirname, "../../..");
    const directGitCall = /execFile(?:Async)?\(\s*["'`]git["'`]/;
    const matches = sourceFiles(sourceRoot)
      .filter((file) => directGitCall.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(sourceRoot, file))
      .sort();

    expect(matches).toEqual([
      "features/github/pull-request-create.ts",
      "features/projects/clone.ts",
      "features/source-control/local-git/backend.ts",
    ]);
  });
});
