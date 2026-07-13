import { beforeEach, describe, expect, it, vi } from "vitest";
import { readClipboardSourceUrl } from "./clipboard-source";

const clipboard = vi.hoisted(() => ({
  readBuffer: vi.fn<(format: string) => Buffer>(),
  readText: vi.fn<() => string>(),
}));

vi.mock("electron", () => ({ clipboard }));

describe("readClipboardSourceUrl", () => {
  beforeEach(() => {
    clipboard.readText.mockReturnValue("pasted text");
    clipboard.readBuffer.mockReturnValue(Buffer.alloc(0));
  });

  it("rejects a source URL when the clipboard text changed", () => {
    clipboard.readText.mockReturnValue("different text");
    clipboard.readBuffer.mockReturnValue(Buffer.from("https://example.com"));

    expect(readClipboardSourceUrl("pasted text")).toEqual({});
    expect(clipboard.readBuffer).not.toHaveBeenCalled();
  });

  it("returns no source URL for an empty custom clipboard format", () => {
    expect(readClipboardSourceUrl("pasted text")).toEqual({});
  });

  it("returns no source URL when reading the custom format fails", () => {
    clipboard.readBuffer.mockImplementation(() => {
      throw new Error("unsupported clipboard format");
    });

    expect(readClipboardSourceUrl("pasted text")).toEqual({});
  });

  it("rejects malformed and non-web URLs", () => {
    for (const source of [
      "not a URL",
      "javascript:alert(1)",
      "file:///tmp/a",
    ]) {
      clipboard.readBuffer.mockReturnValue(Buffer.from(source));
      expect(readClipboardSourceUrl("pasted text")).toEqual({});
    }
  });

  it("returns a normalized HTTPS source URL", () => {
    clipboard.readBuffer.mockReturnValue(
      Buffer.from("https://example.com/article?q=one"),
    );

    expect(readClipboardSourceUrl("pasted text")).toEqual({
      sourceUrl: "https://example.com/article?q=one",
    });
    expect(clipboard.readBuffer).toHaveBeenCalledWith(
      "org.chromium.source-url",
    );
  });
});
