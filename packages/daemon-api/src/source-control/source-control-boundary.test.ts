import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../../..");
const providerRoot = path.join(
  repositoryRoot,
  "packages/daemon/src/features/source-control/providers/github",
);
const rendererRoot = path.join(repositoryRoot, "desktop/src/renderer");
const localeRoot = path.join(repositoryRoot, "desktop/src/shared/i18n/locales");
const sourceRoots = [
  path.join(repositoryRoot, "packages"),
  path.join(repositoryRoot, "desktop/src"),
  path.join(repositoryRoot, "mobile/src"),
];

describe("source-control legacy boundary", () => {
  it("keeps removed GitHub entry points absent", () => {
    expect(
      fs.existsSync(
        path.join(repositoryRoot, "packages/daemon-api/src/github.ts"),
      ),
    ).toBe(false);
    expect(
      fs.existsSync(
        path.join(repositoryRoot, "packages/daemon/src/features/github"),
      ),
    ).toBe(false);

    const legacyRoute = ["/api", "git", "hub", ""].join("/");
    const publicType = new RegExp(`\\b${["Git", "Hub"].join("")}\\p{Lu}`, "u");
    const legacyErrorCodes = [
      "cli-missing",
      "cli-unauthenticated",
      "fetch-failed",
      "item-not-found",
      "merge-conflict",
      "network-unavailable",
      "permission-denied",
      "url-unsupported",
    ].map((suffix) => `${["git", "hub"].join("")}-${suffix}`);
    const legacySlug = ["git", "Hub", "Slug"].join("");
    const violations = sourceFiles(sourceRoots)
      .filter((file) => !file.startsWith(providerRoot))
      .flatMap((file) => {
        const source = fs.readFileSync(file, "utf8");
        return [
          source.includes(legacyRoute) ? "legacy route" : null,
          source.includes(legacySlug) ? "legacy clone slug" : null,
          legacyErrorCodes.some((code) => source.includes(code))
            ? "legacy error code"
            : null,
          isPublicApiFile(file) && publicType.test(source)
            ? "public provider type"
            : null,
        ]
          .filter((violation) => violation !== null)
          .map((violation) => `${relative(file)}: ${violation}`);
      });

    expect(violations).toEqual([]);
  });

  it("keeps provider internals private", () => {
    const internalPath = ["providers", "github", "internal"].join("/");
    const violations = sourceFiles(sourceRoots)
      .filter((file) => !file.startsWith(providerRoot))
      .filter((file) => fs.readFileSync(file, "utf8").includes(internalPath))
      .map(relative);

    expect(violations).toEqual([]);
  });

  it("keeps renderer provider-neutral and remote Git operations absent", () => {
    const providerName = ["git", "hub"].join("");
    const remoteGitCall = new RegExp(
      `workspaceTools\\.git(?:${["Push", "Pull"].join("|")})\\s*\\(`,
    );
    const violations = sourceFiles([rendererRoot]).flatMap((file) => {
      const source = fs.readFileSync(file, "utf8");
      return [
        source.toLocaleLowerCase().includes(providerName)
          ? "provider-specific renderer text"
          : null,
        remoteGitCall.test(source) ? "remote workspace Git call" : null,
      ]
        .filter((violation) => violation !== null)
        .map((violation) => `${relative(file)}: ${violation}`);
    });

    expect(violations).toEqual([]);
  });

  it("allows the provider name in locales only for release settings", () => {
    const providerName = ["Git", "Hub"].join("");
    const occurrences = sourceFiles([localeRoot]).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          line.includes(providerName)
            ? [`${relative(file)}:${index + 1}:${line.trim()}`]
            : [],
        ),
    );

    expect(occurrences.length).toBeGreaterThan(0);
    expect(
      occurrences.every((line) => line.includes(`${providerName} Releases`)),
    ).toBe(true);
  });
});

function isPublicApiFile(file: string) {
  return (
    file.includes("packages/daemon-api/src/") ||
    file.includes("packages/daemon-client/src/")
  );
}

function relative(file: string) {
  return path.relative(repositoryRoot, file);
}

function sourceFiles(roots: readonly string[]): string[] {
  return roots.flatMap(walk);
}

function walk(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ["dist", "node_modules", "target"].includes(entry.name)
        ? []
        : walk(absolute);
    }
    return /\.(?:c|m)?(?:j|t)sx?$/.test(entry.name) ? [absolute] : [];
  });
}
