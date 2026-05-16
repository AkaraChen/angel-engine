import { describe, expect, it } from "vitest";
import type { ParsedDataUrl } from "../media";
import { imageDataUrl, parseDataUrl, parseImageDataUrl } from "../media";

describe("media utils", () => {
  it("formats and parses data URLs", () => {
    const url: string = imageDataUrl("abc", "image/png");
    const parsed: ParsedDataUrl | undefined = parseDataUrl(url);

    expect(url).toBe("data:image/png;base64,abc");
    expect(parsed).toEqual({ data: "abc", mimeType: "image/png" });
  });

  it("parses image data URLs only for image helpers", () => {
    expect(parseImageDataUrl("data:image/jpeg;base64,xyz")).toEqual({
      data: "xyz",
      mimeType: "image/jpeg",
    });
    expect(parseImageDataUrl("data:text/plain;base64,xyz")).toBeUndefined();
  });
});
