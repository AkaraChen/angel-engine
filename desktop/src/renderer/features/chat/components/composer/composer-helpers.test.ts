import { describe, expect, it } from "vitest";
import {
  appendPasteSourceUrls,
  pasteSourceUrlPath,
} from "@/features/chat/components/composer/composer-helpers";

describe("appendPasteSourceUrls", () => {
  it("leaves text unchanged without source URLs", () => {
    expect(appendPasteSourceUrls("Hello", [])).toBe("Hello");
  });

  it("leaves empty text unchanged", () => {
    expect(appendPasteSourceUrls("  ", ["https://example.com/docs"])).toBe(
      "  ",
    );
  });

  it("appends each source URL on its own line", () => {
    expect(
      appendPasteSourceUrls("Hello", [
        "https://example.com/docs",
        "https://example.com/guide",
      ]),
    ).toBe(
      "Hello\n\n(Pasted from https://example.com/docs)\n(Pasted from https://example.com/guide)",
    );
  });
});

describe("pasteSourceUrlPath", () => {
  it("keeps the path, query, and hash", () => {
    expect(pasteSourceUrlPath("https://example.com/docs?page=2#install")).toBe(
      "/docs?page=2#install",
    );
  });
});
