// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageKey = "angel-engine.transcript-density.v1";
const memory = new Map<string, string>();

const localStorageMock = {
  clear: () => memory.clear(),
  getItem: (key: string) => memory.get(key) ?? null,
  key: (index: number) => [...memory.keys()][index] ?? null,
  removeItem: (key: string) => {
    memory.delete(key);
  },
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  get length() {
    return memory.size;
  },
};

vi.stubGlobal("localStorage", localStorageMock);
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

const { useTranscriptDensityStore } = await import(
  "./transcript-density-store"
);

beforeEach(() => {
  memory.clear();
  useTranscriptDensityStore.setState({
    densities: {
      chat: "compact",
      power: "normal",
      work: "normal",
    },
  });
});

afterEach(() => {
  memory.clear();
});

describe("useTranscriptDensityStore", () => {
  it("defaults chat mode to compact and other modes to normal", () => {
    const { densityFor } = useTranscriptDensityStore.getState();
    expect(densityFor("chat")).toBe("compact");
    expect(densityFor("work")).toBe("normal");
    expect(densityFor("power")).toBe("normal");
  });

  it("persists a density change for one workspace mode only", () => {
    useTranscriptDensityStore.getState().setDensity("chat", "debug");
    useTranscriptDensityStore.getState().setDensity("work", "compact");

    expect(useTranscriptDensityStore.getState().densityFor("chat")).toBe(
      "debug",
    );
    expect(useTranscriptDensityStore.getState().densityFor("work")).toBe(
      "compact",
    );
    expect(useTranscriptDensityStore.getState().densityFor("power")).toBe(
      "normal",
    );

    const stored = JSON.parse(memory.get(storageKey) ?? "{}");
    expect(stored).toEqual({
      chat: "debug",
      power: "normal",
      work: "compact",
    });
  });

  it("is a no-op when the density is already set", () => {
    memory.set(
      storageKey,
      JSON.stringify({ chat: "compact", power: "normal", work: "normal" }),
    );
    const before = memory.get(storageKey);

    useTranscriptDensityStore.getState().setDensity("chat", "compact");

    expect(memory.get(storageKey)).toBe(before);
  });
});
