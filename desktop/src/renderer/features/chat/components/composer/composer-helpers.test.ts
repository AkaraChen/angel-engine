import { describe, expect, it } from "vitest";
import { appendPasteSourceUrl } from "@/features/chat/components/composer/composer-helpers";

describe("appendPasteSourceUrl", () => {
  it("leaves text unchanged without a source URL", () => {
    expect(appendPasteSourceUrl("Hello")).toBe("Hello");
  });

  it("leaves empty text unchanged", () => {
    expect(appendPasteSourceUrl("  ", "https://example.com/docs")).toBe("  ");
  });

  it("appends the source URL on its own line", () => {
    expect(appendPasteSourceUrl("Hello", "https://example.com/docs")).toBe(
      "Hello\n\n(Pasted from https://example.com/docs)",
    );
  });
});
