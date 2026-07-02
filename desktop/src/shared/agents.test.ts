import { describe, expect, it } from "vitest";

import {
  AGENT_OPTIONS,
  isAgentRuntime,
  resolveEnabledAgentRuntime,
  sanitizeAgentSettings,
} from "./agents";

describe("agent runtime settings", () => {
  it("treats codex as an agent runtime", () => {
    expect(isAgentRuntime("codex")).toBe(true);
    expect(AGENT_OPTIONS.map((agent) => agent.id)).toContain("codex");
  });

  it("keeps explicit codex settings", () => {
    const settings = sanitizeAgentSettings({
      defaultRuntime: "codex",
      enabledRuntimes: ["codex"],
      lastRuntime: "codex",
    });

    expect(settings.enabledRuntimes).toEqual(["codex"]);
    expect(settings.lastRuntime).toBe("codex");
  });

  it("does not make codex the implicit default runtime", () => {
    const settings = sanitizeAgentSettings(undefined);

    expect(settings.lastRuntime).not.toBe("codex");
  });

  it("fails when no enabled runtime can be resolved", () => {
    expect(() =>
      resolveEnabledAgentRuntime(
        {
          enabledRuntimes: [],
          runtimePreferences: {},
        },
        undefined,
        [],
      ),
    ).toThrow("No enabled agent runtime is available.");
  });
});
