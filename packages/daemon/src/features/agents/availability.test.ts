import { Effect, Layer } from "effect";
import { describe, expect, it, vi } from "vitest";

import which from "which";
import { Db } from "../../platform/db";
import { listAvailableAgents } from "./availability";

vi.mock("which", () => ({
  default: vi.fn(async () => "/usr/bin/fake-agent"),
}));

vi.mock("./repository", () => ({
  listCustomAgents: () => Effect.succeed([]),
}));

// The repository is mocked, so the database is never touched.
const testDbLayer = Layer.succeed(
  Db,
  new Db({ database: Effect.die("Database is not used in this test.") }),
);

function runListAvailableAgents() {
  return Effect.runPromise(
    listAvailableAgents().pipe(Effect.provide(testDbLayer)),
  );
}

describe("listAvailableAgents", () => {
  it("does not advertise cursor", async () => {
    const agents = await runListAvailableAgents();

    expect(agents.map((agent) => agent.id)).not.toContain("cursor");
  });

  it("advertises pi only when the cli exists", async () => {
    vi.mocked(which).mockImplementation(async (command) =>
      command === "pi" ? (null as unknown as string) : "/usr/bin/fake-agent",
    );

    await expect(runListAvailableAgents()).resolves.not.toContainEqual(
      expect.objectContaining({ id: "pi" }),
    );

    vi.mocked(which).mockResolvedValue("/usr/bin/pi");

    await expect(runListAvailableAgents()).resolves.toContainEqual(
      expect.objectContaining({ id: "pi" }),
    );
  });
});
