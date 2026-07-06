import { describe, expect, it, vi } from "vitest";

import which from "which";
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

  it("advertises pi only when the cli exists", async () => {
    vi.mocked(which).mockImplementation(async (command) =>
      command === "pi" ? (null as unknown as string) : "/usr/bin/fake-agent",
    );

    await expect(listAvailableAgents()).resolves.not.toContainEqual(
      expect.objectContaining({ id: "pi" }),
    );

    vi.mocked(which).mockResolvedValue("/usr/bin/pi");

    await expect(listAvailableAgents()).resolves.toContainEqual(
      expect.objectContaining({ id: "pi" }),
    );
  });
});
