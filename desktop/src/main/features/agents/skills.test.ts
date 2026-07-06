import { listAgentSkillsFromDirs } from "@angel-engine/client-napi";

import { describe, expect, it, vi } from "vitest";

import { createAgentSkillDiscoveryRequest, listSkillsForAgent } from "./skills";

vi.mock("@angel-engine/client-napi", () => ({
  listAgentSkillsFromDirs: vi.fn(() => []),
}));

describe("agent skill discovery requests", () => {
  it("uses JS-registered pi skill directories", () => {
    expect(
      createAgentSkillDiscoveryRequest(
        {
          projectPath: "/repo",
          runtime: "pi",
        },
        "/Users/me",
      ),
    ).toEqual({
      globalDirs: ["/Users/me/.pi/agent/skills", "/Users/me/.agents/skills"],
      projectPath: "/repo",
      projectRelativeDirs: [".pi/skills", ".agents/skills"],
    });
  });

  it("uses JS-registered claude skill directories", () => {
    expect(
      createAgentSkillDiscoveryRequest(
        {
          runtime: "claude",
        },
        "/Users/me",
      ),
    ).toEqual({
      globalDirs: ["/Users/me/.claude/skills"],
      projectPath: null,
      projectRelativeDirs: [".claude/skills"],
    });
  });

  it("does not ask rust to infer custom or unsupported runtime directories", () => {
    expect(
      createAgentSkillDiscoveryRequest(
        {
          projectPath: "/repo",
          runtime: "custom:local",
        },
        "/Users/me",
      ),
    ).toBeNull();
    expect(
      createAgentSkillDiscoveryRequest(
        {
          projectPath: "/repo",
          runtime: "qoder",
        },
        "/Users/me",
      ),
    ).toBeNull();
  });

  it("passes explicit directory rules to napi", () => {
    listSkillsForAgent({
      projectPath: "/repo",
      runtime: "pi",
    });

    expect(listAgentSkillsFromDirs).toHaveBeenCalledWith({
      globalDirs: expect.arrayContaining([
        expect.stringMatching(/\.pi\/agent\/skills$/),
        expect.stringMatching(/\.agents\/skills$/),
      ]),
      projectPath: "/repo",
      projectRelativeDirs: [".pi/skills", ".agents/skills"],
    });
  });
});
