import type { ProcessRegistryEntry } from "@angel-engine/daemon-api/daemon";

import { describe, expect, it, vi } from "vitest";

import { ProcessRegistry } from "./processes";

vi.mock("@angel-engine/client-napi", () => ({
  listListeningPorts: vi.fn(() => []),
  listSubprocesses: vi.fn(() => []),
}));

const chatEntry: ProcessRegistryEntry = {
  id: "chat-1",
  label: "Codex",
  rootPid: 123,
};
const externalEntry: ProcessRegistryEntry = {
  id: "terminal-1",
  label: "Terminal",
  rootPid: 456,
};

describe("ProcessRegistry", () => {
  it("keeps public and chat-owned entries independent", () => {
    const registry = new ProcessRegistry();
    const chatUpdates: ProcessRegistryEntry[][] = [];
    registry.observeChat((entries) => {
      chatUpdates.push([...entries]);
    });

    registry.replaceChat([chatEntry]);
    registry.replaceExternal([externalEntry]);
    expect(registry.entries()).toEqual([externalEntry, chatEntry]);
    expect(chatUpdates).toEqual([[], [chatEntry]]);

    registry.replaceExternal([]);
    expect(registry.entries()).toEqual([chatEntry]);
    expect(chatUpdates).toEqual([[], [chatEntry]]);

    registry.replaceExternal([externalEntry]);
    registry.replaceChat([]);
    expect(registry.entries()).toEqual([externalEntry]);
    expect(chatUpdates).toEqual([[], [chatEntry], []]);
  });

  it("uses chat ownership for collisions without hiding chat removal", () => {
    const registry = new ProcessRegistry();
    const external = { ...externalEntry, id: chatEntry.id };
    const chatUpdates: ProcessRegistryEntry[][] = [];
    registry.observeChat((entries) => {
      chatUpdates.push([...entries]);
    });

    registry.replaceExternal([external]);
    registry.replaceChat([chatEntry]);
    expect(registry.entries()).toEqual([chatEntry]);

    registry.replaceChat([]);
    expect(registry.entries()).toEqual([external]);
    expect(chatUpdates.at(-1)).toEqual([]);
  });
});
