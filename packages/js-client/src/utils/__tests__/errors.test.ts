import { describe, expect, it } from "vitest";
import { abortError, errorMessage, throwIfAborted } from "../errors";

describe("error utils", () => {
  it("converts unknown errors into messages", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });

  it("throws the abort reason when available", () => {
    const controller: AbortController = new AbortController();
    const reason: Error = new Error("stop");
    controller.abort(reason);

    expect(abortError(controller.signal)).toBe(reason);
    expect(() => throwIfAborted(controller.signal)).toThrow(reason);
  });

  it("creates a default abort error", () => {
    const error: Error = abortError();

    expect(error.name).toBe("AbortError");
    expect(error.message).toBe("Chat request cancelled.");
  });
});
