import { describe, expect, it } from "vitest";
import type { AgentAdapter } from "../adapter";
import { AngelClient } from "../client";

const adapter: AgentAdapter = {
  id: "codex",
  async *run() {},
};

describe("AngelClient", () => {
  it("stores the default runtime on chat creation", async () => {
    const client = new AngelClient({ adapters: [adapter] });

    const chat = await client.chats.create();

    expect(chat.runtime).toBe("codex");
  });

  it("stores an explicit canonical runtime on chat creation", async () => {
    const client = new AngelClient({ adapters: [adapter] });

    const chat = await client.chats.create({ runtime: "codex" });

    expect(chat.runtime).toBe("codex");
  });

  it("rejects an unknown runtime on chat creation", async () => {
    const client = new AngelClient({ adapters: [adapter] });

    await expect(client.chats.create({ runtime: "missing" })).rejects.toThrow(
      'No agent adapter registered for runtime "missing".',
    );
  });

  it("stores an explicit canonical runtime on runtime update", async () => {
    const client = new AngelClient({ adapters: [adapter] });
    const chat = await client.chats.create();

    const updated = await client.chats.setRuntime({
      chatId: chat.id,
      runtime: "codex",
    });

    expect(updated.runtime).toBe("codex");
  });

  it("rejects an unknown runtime update without changing the stored chat", async () => {
    const client = new AngelClient({ adapters: [adapter] });
    const chat = await client.chats.create();

    await expect(
      client.chats.setRuntime({ chatId: chat.id, runtime: "missing" }),
    ).rejects.toThrow('No agent adapter registered for runtime "missing".');
    await expect(client.chats.load(chat.id)).resolves.toMatchObject({
      chat: { runtime: "codex" },
    });
  });
});
