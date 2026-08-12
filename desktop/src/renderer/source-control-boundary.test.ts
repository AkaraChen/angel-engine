import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = path.resolve(import.meta.dirname);
const remoteWorkspaceToolCall = new RegExp(
  `workspaceTools\\.git(?:${["Push", "Pull"].join("|")})\\s*\\(`,
  "g",
);

describe("renderer source-control boundary", () => {
  it("rejects renderer push and pull calls", () => {
    const violations = sourceFiles(rendererRoot).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      const lines = source.split("\n");
      return lines.flatMap((line, index) => {
        remoteWorkspaceToolCall.lastIndex = 0;
        if (!remoteWorkspaceToolCall.test(line)) return [];
        return [`${path.relative(rendererRoot, file)}:${index + 1}`];
      });
    });

    expect(violations).toEqual([]);
  });
});

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolute);
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      return [];
    }
    return [absolute];
  });
}
