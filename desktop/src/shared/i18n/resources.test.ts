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

function leafEntries(value: unknown, prefix = ""): [string, string][] {
  if (typeof value !== "object" || value === null) {
    return typeof value === "string" ? [[prefix, value]] : [];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    leafEntries(child, prefix ? `${prefix}.${key}` : key),
  );
}

function pathsMatchingEnglish(
  english: unknown,
  translation: unknown,
): string[] {
  const englishValues = new Map(leafEntries(english));
  return leafEntries(translation)
    .filter(([path, value]) => englishValues.get(path) === value)
    .map(([path]) => path)
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

  it("does not silently reuse English schedule copy", () => {
    const intentionallySame: Partial<Record<typeof language, string[]>> = {
      de: ["name"],
      es: ["triggerType.manual"],
      fr: ["status.active"],
    };

    expect(
      pathsMatchingEnglish(
        resources.en.translation.schedule,
        resources[language].translation.schedule,
      ),
    ).toEqual(intentionallySame[language] ?? []);
  });
});
