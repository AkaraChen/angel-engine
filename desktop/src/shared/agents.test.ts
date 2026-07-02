import { describe, expect, it } from "vitest";

import {
  AGENT_OPTIONS,
  isAgentRuntime,
  resolveEnabledAgentRuntime,
  sanitizeAgentSettings,
} from "./agents";

describe("agent runtime settings", () => {
  it("does not treat codex as an agent runtime", () => {
    expect(isAgentRuntime("codex")).toBe(false);
    expect(AGENT_OPTIONS.map((agent) => agent.id)).not.toContain("codex");
  });

  it("does not migrate invalid codex settings to another runtime", () => {
    const settings = sanitizeAgentSettings({
      defaultRuntime: "codex",
      enabledRuntimes: ["codex"],
      lastRuntime: "codex",
    });

    expect(settings.enabledRuntimes).toEqual([]);
    expect(settings.lastRuntime).toBeUndefined();
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
