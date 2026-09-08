import { describe, expect, it } from "vitest";
import { resources, supportedLanguages } from "./resources";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];

  return Object.entries(value)
    .flatMap(([key, child]) =>
      leafPaths(child, prefix ? `${prefix}.${key}` : key),
    )
    .sort();
}

const englishPaths = leafPaths(resources.en.translation);
const translatedLanguages = supportedLanguages.filter(
  (language) => language !== "en",
);

describe.each(translatedLanguages)("%s locale", (language) => {
  it("contains every translation key", () => {
    expect(leafPaths(resources[language].translation)).toEqual(englishPaths);
  });
});

describe.each(
  supportedLanguages,
)("%s source control terminology", (language) => {
  it("localizes the no-changes empty state", () => {
    const noChanges =
      resources[language].translation.workspace.tools.empty.noChanges;

    expect(noChanges.length).toBeGreaterThan(0);
    if (language !== "en") expect(noChanges).not.toBe("No changes");
  });

  it("uses the provider-neutral composer keys", () => {
    const composer = resources[language].translation.composer;

    expect(composer).not.toHaveProperty("attachGitHub");
    expect(composer).not.toHaveProperty("githubIssue");
    expect(composer).not.toHaveProperty("githubPullRequest");
    expect(composer).not.toHaveProperty("taskLinkHintGitHubPath");
  });
});
