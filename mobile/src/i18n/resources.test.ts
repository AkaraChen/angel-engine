import { describe, expect, it } from "vitest";

import {
  detectPreferredLanguage,
  matchSupportedLanguage,
  normalizeSupportedLanguage,
  resources,
  supportedLanguages,
} from "./resources";

describe("matchSupportedLanguage", () => {
  it("maps regional variants onto the shipped languages", () => {
    expect(matchSupportedLanguage("en-GB")).toBe("en");
    expect(matchSupportedLanguage("fr-FR")).toBe("fr");
    expect(matchSupportedLanguage("de-CH")).toBe("de");
    expect(matchSupportedLanguage("es-419")).toBe("es");
    expect(matchSupportedLanguage("ko-KR")).toBe("ko");
    expect(matchSupportedLanguage("ja-JP")).toBe("ja");
  });

  it("splits Chinese into simplified and traditional", () => {
    expect(matchSupportedLanguage("zh")).toBe("zh-CN");
    expect(matchSupportedLanguage("zh-CN")).toBe("zh-CN");
    expect(matchSupportedLanguage("zh-Hans")).toBe("zh-CN");
    expect(matchSupportedLanguage("zh-TW")).toBe("zh-TW");
    expect(matchSupportedLanguage("zh-HK")).toBe("zh-TW");
    expect(matchSupportedLanguage("zh-Hant")).toBe("zh-TW");
  });

  it("returns null for unsupported or empty tags instead of defaulting", () => {
    expect(matchSupportedLanguage("pt-BR")).toBeNull();
    expect(matchSupportedLanguage("ru")).toBeNull();
    expect(matchSupportedLanguage("")).toBeNull();
    expect(matchSupportedLanguage(null)).toBeNull();
    expect(matchSupportedLanguage(undefined)).toBeNull();
  });
});

describe("normalizeSupportedLanguage", () => {
  it("falls back to English for unknown tags", () => {
    expect(normalizeSupportedLanguage("pt-BR")).toBe("en");
    expect(normalizeSupportedLanguage(null)).toBe("en");
  });

  it("preserves supported tags", () => {
    for (const language of supportedLanguages) {
      expect(normalizeSupportedLanguage(language)).toBe(language);
    }
  });
});

describe("detectPreferredLanguage", () => {
  it("honours a supported secondary preference over English fallback", () => {
    // Primary locale is unsupported, but the next preference ships — pick it.
    expect(detectPreferredLanguage(["pt-BR", "fr-FR", "en-US"])).toBe("fr");
  });

  it("returns the first matching preference in order", () => {
    expect(detectPreferredLanguage(["ja-JP", "ko-KR"])).toBe("ja");
  });

  it("falls back to English when nothing matches", () => {
    expect(detectPreferredLanguage(["pt-BR", "ru"])).toBe("en");
    expect(detectPreferredLanguage([])).toBe("en");
    expect(detectPreferredLanguage([null, undefined, ""])).toBe("en");
  });
});

describe("resources", () => {
  it("ships a translation bundle for every supported language", () => {
    for (const language of supportedLanguages) {
      expect(resources[language].translation.app.name).toBe("Angel Engine");
    }
  });
});
