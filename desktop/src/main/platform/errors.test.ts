import { describe, expect, it } from "vitest";
import { isMainIpcErrorEnvelope } from "../../shared/main-ipc-error";
import { MainIpcError, mainIpcErrorEnvelope } from "./errors";

describe("main IPC error envelope", () => {
  it("preserves the stable code and English diagnostic message", () => {
    const envelope = mainIpcErrorEnvelope(MainIpcError.daemonUnavailable());

    expect(isMainIpcErrorEnvelope(envelope)).toBe(true);
    expect(envelope.__angelMainIpcError).toEqual({
      code: "daemon-unavailable",
      message: "Backend is unavailable.",
    });
  });
});
