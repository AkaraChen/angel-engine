import { describe, expect, test, vi } from "vitest";

import { normalizeChatRuntime } from "./repository";

describe("normalizeChatRuntime", () => {
  test("rejects unknown runtime ids", () => {
    expect(() => normalizeChatRuntime("bad-runtime")).toThrow(
      "Unknown chat runtime.",
    );
  });

  test("accepts builtin runtime ids", () => {
    expect(normalizeChatRuntime("codex")).toBe("codex");
  });

  test("accepts existing custom runtime ids", () => {
    expect(
      normalizeChatRuntime(
        "custom:agent",
        vi.fn(() => true),
      ),
    ).toBe("custom:agent");
  });

  test("rejects missing custom runtime ids", () => {
    expect(() =>
      normalizeChatRuntime(
        "custom:missing",
        vi.fn(() => false),
      ),
    ).toThrow("Unknown chat runtime.");
  });

  test("set-runtime validation happens before persistence", () => {
    const runtime = "codex";

    expect(() => normalizeChatRuntime("bad-runtime")).toThrow(
      "Unknown chat runtime.",
    );
    expect(runtime).toBe("codex");
  });
});
