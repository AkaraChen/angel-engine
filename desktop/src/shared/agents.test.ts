import { describe, expect, it } from "vitest";

import {
  AGENT_OPTIONS,
  getEnabledAgentOptions,
  isAgentRuntime,
  moveAgentRuntimeOrder,
  rememberAgentOrder,
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
      agentOrder: ["codex"],
      defaultRuntime: "codex",
      enabledRuntimes: ["codex"],
      lastRuntime: "codex",
    });

    expect(settings.enabledRuntimes).toEqual(["codex"]);
    expect(settings.agentOrder[0]).toBe("codex");
    expect(settings.lastRuntime).toBe("codex");
  });

  it("orders enabled agent options from settings", () => {
    const settings = sanitizeAgentSettings({
      agentOrder: ["codex", "kimi"],
      enabledRuntimes: ["kimi", "codex"],
    });

    expect(
      getEnabledAgentOptions(settings, AGENT_OPTIONS).map((agent) => agent.id),
    ).toEqual(["codex", "kimi"]);
  });

  it("remembers an updated agent order", () => {
    const settings = sanitizeAgentSettings(undefined);
    const next = rememberAgentOrder(settings, ["codex", "kimi"]);

    expect(next.agentOrder.slice(0, 2)).toEqual(["codex", "kimi"]);
    expect(next.agentOrder).toContain("claude");
  });

  it("moves an agent to a drop target index", () => {
    expect(
      moveAgentRuntimeOrder(["kimi", "codex", "claude"], "kimi", 3),
    ).toEqual(["codex", "claude", "kimi"]);
    expect(
      moveAgentRuntimeOrder(["kimi", "codex", "claude"], "claude", 0),
    ).toEqual(["claude", "kimi", "codex"]);
  });

  it("does not make codex the implicit default runtime", () => {
    const settings = sanitizeAgentSettings(undefined);

    expect(settings.lastRuntime).not.toBe("codex");
  });

  it("fails when no enabled runtime can be resolved", () => {
    expect(() =>
      resolveEnabledAgentRuntime(
        {
          agentOrder: [],
          enabledRuntimes: [],
          runtimePreferences: {},
        },
        undefined,
        [],
      ),
    ).toThrow("No enabled agent runtime is available.");
  });
});
