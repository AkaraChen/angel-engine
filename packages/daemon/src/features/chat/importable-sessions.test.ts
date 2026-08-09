import { describe, expect, it } from "vitest";
import {
  emptyImportableResult,
  mapNativeImportableResult,
} from "./importable-sessions";

describe("mapNativeImportableResult", () => {
  it("maps a generated NAPI result without inventing remote ids", () => {
    expect(
      mapNativeImportableResult({
        nextCursor: "next",
        sessions: [{ remoteId: "t1", title: "One", cwd: "/repo" }],
        unsupportedReason: undefined,
      }),
    ).toEqual({
      nextCursor: "next",
      sessions: [
        { remoteId: "t1", title: "One", cwd: "/repo", updatedAt: null },
      ],
      unsupportedReason: null,
    });
  });

  it("rejects a missing sessions array instead of inventing empty success", () => {
    expect(() =>
      mapNativeImportableResult({
        sessions: undefined as unknown as [],
      }),
    ).toThrow(/missing sessions array/i);
  });

  it("rejects empty remote ids instead of dropping them silently", () => {
    expect(() =>
      mapNativeImportableResult({
        sessions: [
          { remoteId: "ok", title: "A" },
          { remoteId: "", title: "bad" },
        ],
      }),
    ).toThrow(/empty remote id/i);
  });

  it("returns an explicit unsupported payload when listing is not available", () => {
    expect(emptyImportableResult("not supported")).toEqual({
      nextCursor: null,
      sessions: [],
      unsupportedReason: "not supported",
    });
  });
});
