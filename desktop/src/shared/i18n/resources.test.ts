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
