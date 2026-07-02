import { describe, expect, test, vi } from "vitest";

vi.mock("which", () => ({
  default: vi.fn(async () => "/usr/bin/fake-agent"),
}));

vi.mock("./repository", () => ({
  listCustomAgents: () => [],
}));

import { listAvailableAgents } from "./availability";

describe("listAvailableAgents", () => {
  test("does not advertise cursor", async () => {
    const agents = await listAvailableAgents();

    expect(agents.map((agent) => agent.id)).not.toContain("cursor");
  });
});
