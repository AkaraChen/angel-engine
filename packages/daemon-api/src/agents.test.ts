import { describe, expect, it } from "vitest";

import {
  AGENT_OPTIONS,
  AGENT_SKILL_DIRECTORY_RULES,
  getEnabledAgentOptions,
  isAgentRuntime,
  moveAgentRuntimeOrder,
  rememberAgentOrder,
  resolveEnabledAgentRuntime,
  sanitizeAgentSettings,
} from "./agents";

describe("agent runtime settings", () => {
  it("treats built-in ids as agent runtimes", () => {
    expect(isAgentRuntime("codex")).toBe(true);
    expect(isAgentRuntime("pi")).toBe(true);
    expect(AGENT_OPTIONS.map((agent) => agent.id)).toContain("codex");
    expect(AGENT_OPTIONS.map((agent) => agent.id)).toContain("pi");
  });

  it("keeps built-in skill directory rules in shared JS definitions", () => {
    expect(AGENT_SKILL_DIRECTORY_RULES.claude).toEqual({
      globalDirs: ["~/.claude/skills"],
      projectRelativeDirs: [".claude/skills"],
    });
    expect(AGENT_SKILL_DIRECTORY_RULES.pi).toEqual({
      globalDirs: ["~/.pi/agent/skills", "~/.agents/skills"],
      projectRelativeDirs: [".pi/skills", ".agents/skills"],
    });
    expect(
      AGENT_OPTIONS.find((agent) => agent.id === "pi")?.skillDirectories,
    ).toBe(AGENT_SKILL_DIRECTORY_RULES.pi);
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
    expect(next.agentOrder).toContain("pi");
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
