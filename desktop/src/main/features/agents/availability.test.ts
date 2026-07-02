import { describe, expect, it, vi } from "vitest";

import { listAvailableAgents } from "./availability";

vi.mock("which", () => ({
  default: vi.fn(async () => "/usr/bin/fake-agent"),
}));

vi.mock("./repository", () => ({
  listCustomAgents: () => [],
}));

describe("listAvailableAgents", () => {
  it("does not advertise cursor", async () => {
    const agents = await listAvailableAgents();

    expect(agents.map((agent) => agent.id)).not.toContain("cursor");
  });
});
