import { describe, expect, it } from "vitest";
import { contentBlockText, stringifyToolResult } from "../tooling";

describe("claude tooling content blocks", () => {
  it("renders text blocks", () => {
    expect(contentBlockText({ text: "hello", type: "text" })).toBe("hello");
  });

  it("renders image blocks as placeholders", () => {
    expect(
      contentBlockText({
        source: { media_type: "image/png", type: "base64" },
        type: "image",
      }),
    ).toBe("[image image/png]");
  });

  it("uses a generic image placeholder when media type is missing", () => {
    expect(contentBlockText({ source: {}, type: "image" })).toBe(
      "[image image]",
    );
  });

  it("still rejects unknown block types", () => {
    expect(() => contentBlockText({ type: "video" })).toThrow(
      "Unknown Claude content block type.",
    );
  });

  it("renders mixed text and image tool-result arrays", () => {
    expect(
      stringifyToolResult([
        { text: "created", type: "text" },
        { source: { media_type: "image/jpeg" }, type: "image" },
      ]),
    ).toBe("created\n[image image/jpeg]");
  });
});
