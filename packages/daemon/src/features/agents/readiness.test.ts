import { describe, expect, it } from "vitest";

import {
  readinessForCustomAgent,
  readinessFromBinaryPresence,
  recoveryActionsForReadiness,
} from "./readiness";

describe("readinessFromBinaryPresence", () => {
  it("marks present binaries ready", () => {
    expect(
      readinessFromBinaryPresence({ available: true, command: "codex" }),
    ).toEqual({ detail: "codex", status: "ready" });
  });

  it("marks missing binaries unavailable without provider branching", () => {
    expect(
      readinessFromBinaryPresence({ available: false, command: "kimi" }),
    ).toEqual({
      detail: "Command not found: kimi",
      status: "unavailable",
    });
  });

  it("maps probe failures to error", () => {
    expect(
      readinessFromBinaryPresence({
        available: false,
        command: "pi",
        probeError: "probe timed out",
      }),
    ).toEqual({ detail: "probe timed out", status: "error" });
  });
});

describe("readinessForCustomAgent", () => {
  const agent = {
    args: [],
    autoAuthenticate: false,
    command: "my-agent",
    createdAt: "2026-01-01T00:00:00.000Z",
    environment: [],
    id: "custom:1" as const,
    label: "Mine",
    needAuth: true,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("surfaces authentication-required when needAuth and binary exists", () => {
    expect(readinessForCustomAgent({ agent, available: true })).toMatchObject({
      status: "authentication-required",
    });
  });

  it("keeps unavailable when the custom command is missing", () => {
    expect(readinessForCustomAgent({ agent, available: false })).toMatchObject({
      status: "unavailable",
    });
  });
});

describe("recoveryActionsForReadiness", () => {
  it("returns a closed action set per status", () => {
    expect(recoveryActionsForReadiness("ready", "builtin")).toEqual([
      "view-details",
    ]);
    expect(
      recoveryActionsForReadiness("authentication-required", "builtin"),
    ).toEqual(["authenticate", "view-details"]);
    expect(recoveryActionsForReadiness("unavailable", "custom")).toEqual([
      "edit-command",
      "test-again",
      "view-details",
    ]);
    expect(recoveryActionsForReadiness("error", "builtin")).toEqual([
      "test-again",
      "view-details",
    ]);
    expect(recoveryActionsForReadiness("checking", "builtin")).toEqual([]);
  });
});
